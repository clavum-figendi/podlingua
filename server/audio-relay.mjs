import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { resolve4 as dnsResolve4 } from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const ORIGIN = 'https://clavum-figendi.github.io';
export const MAX_FILE = 100 * 1024 * 1024;
export const DAILY_BUDGET = 1024 * 1024 * 1024;
const fail = (status, reason) => Object.assign(new Error(reason), { status });
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// This transport never accepts caller headers, credentials or proxy settings.
export function requestUpstream(url, { signal, lookup }) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', signal, lookup, agent: false,
      headers: { Accept: 'audio/*', 'Accept-Encoding': 'identity' }, maxHeaderSize: 16384 }, resolve);
    req.on('error', reject);
    req.end();
  });
}

function send(res, status, error) {
  if (res.destroyed) return;
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(error ? { error } : { ok: true }));
}

// Synchronous durable updates serialize all admissions in this process. An
// exclusive lifetime lock prevents a second process sharing the same ledger.
function ledger(statePath, now) {
  if (!statePath || !path.isAbsolute(statePath)) throw fail(503, 'state_configuration');
  fs.mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  const parent = fs.realpathSync(path.dirname(statePath));
  if (parent === repo || parent.startsWith(repo + path.sep)) throw fail(503, 'state_configuration');
  statePath = path.join(parent, path.basename(statePath));
  const lockPath = statePath + '.lock';
  const lock = fs.openSync(lockPath, 'wx', 0o600);
  const close = () => { fs.closeSync(lock); fs.unlinkSync(lockPath); };
  const marker = statePath + '.initialized';
  const persist = value => {
    // A fixed temp name is safe under the lifetime lock; no audio is stored.
    const tmp = statePath + '.tmp';
    const fd = fs.openSync(tmp, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(tmp, statePath);
    const dir = fs.openSync(parent, 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  };
  try {
    if (!fs.existsSync(statePath)) {
      if (fs.existsSync(marker)) throw fail(503, 'state_missing');
      fs.writeFileSync(marker, 'initialized\n', { flag: 'wx', mode: 0o600 });
      persist({ version: 1, day: new Date(now()).toISOString().slice(0, 10), reserved: 0, admissions: [], last: now() });
    } else if (!fs.existsSync(marker)) {
      throw fail(503, 'state_corrupt');
    }
    const read = () => {
      if (!fs.lstatSync(statePath).isFile() || fs.lstatSync(statePath).isSymbolicLink()) throw fail(503, 'state_corrupt');
      const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (s.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(s.day) || !Number.isSafeInteger(s.reserved) || s.reserved < 0 || s.reserved > DAILY_BUDGET || !Number.isSafeInteger(s.last) || !Array.isArray(s.admissions) || s.admissions.length > 60 || !s.admissions.every(v => Number.isSafeInteger(v) && v <= s.last)) throw fail(503, 'state_corrupt');
      return s;
    };
    read();
    return { close, update(bytes, admission = false) {
      try {
        const s = read();
        const time = now();
        if (time < s.last) throw fail(503, 'clock_regression');
        const day = new Date(time).toISOString().slice(0, 10);
        if (day !== s.day) { s.day = day; s.reserved = 0; }
        s.last = time;
        s.admissions = s.admissions.filter(v => v > time - 3600000);
        if (admission) {
          if (s.admissions.length >= 60) throw fail(429, 'hourly_limit');
          s.admissions.push(time);
        }
        if (s.reserved + bytes > DAILY_BUDGET) throw fail(429, 'daily_limit');
        s.reserved += bytes;
        persist(s);
      } catch (err) { throw err.status ? err : fail(503, 'state_unavailable'); }
    } };
  } catch (err) { close(); throw err; }
}

// Race even non-cancellable DNS against the total deadline; destroy responses
// arriving after cancellation instead of leaking an unused upstream socket.
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(fail(504, 'timeout'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) { value?.destroy?.(); reject(fail(504, 'timeout')); }
      else resolve(value);
    }, err => { signal.removeEventListener('abort', abort); reject(err); });
  });
}

export function createRelay({ statePath = process.env.PODLINGUA_RELAY_STATE, resolve4 = dnsResolve4, upstream = requestUpstream, now = Date.now, timeoutMs = 240000 } = {}) {
  const state = ledger(statePath, now);
  let active = 0;
  const server = http.createServer(async (req, res) => {
    const route = req.url;
    if (req.method === 'GET' && ['/health', '/podlingua-audio/health'].includes(route)) { send(res, 200); return; }
    if (!['/fetch', '/podlingua-audio/fetch'].includes(route)) { send(res, 404, 'not_found'); return; }
    if (req.headers.origin !== ORIGIN) { send(res, 403, 'origin_denied'); return; }
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      const headers = (req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
      if (req.headers['access-control-request-method'] !== 'POST' || headers.some(x => x !== 'content-type')) { send(res, 403, 'preflight_denied'); return; }
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return;
    }
    if (req.method !== 'POST') { send(res, 405, 'method_denied'); return; }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) { send(res, 415, 'content_type'); return; }
    if (active >= 2) { send(res, 429, 'concurrency_limit'); return; }
    active++;
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, timeoutMs);
    timer.unref();
    req.once('aborted', abort);
    res.once('close', abort);
    const onAbort = () => {
      if (!res.headersSent && !res.destroyed) {
        res.once('finish', () => { if (!req.complete) req.destroy(); });
        send(res, 504, 'timeout');
      } else { res.destroy(); if (!req.complete) req.destroy(); }
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
    let response;
    try {
      let size = 0; const chunks = [];
      if (Number(req.headers['content-length']) > 8192) throw fail(413, 'body_limit');
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > 8192) throw fail(413, 'body_limit');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'invalid_json'); }
      if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length !== 1 || typeof body.url !== 'string') throw fail(400, 'invalid_body');
      let url;
      try { url = validateMediaURL(body.url); } catch { throw fail(400, 'url_denied'); }
      state.update(0, true);
      for (let redirects = 0; ; redirects++) {
        controller.signal.throwIfAborted();
        const addresses = await abortable(resolve4(url.hostname), controller.signal);
        controller.signal.throwIfAborted();
        if (!Array.isArray(addresses) || !addresses.length || !addresses.every(isPublicIPv4)) throw fail(502, 'dns_denied');
        const address = addresses[0];
        const lookup = (_host, options, callback) => {
          if (typeof options === 'function') { callback = options; options = {}; }
          callback(null, options?.all ? [{ address, family: 4 }] : address, 4);
        };
        response = await abortable(upstream(url, { signal: controller.signal, address, lookup }), controller.signal);
        controller.signal.throwIfAborted();
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          const location = response.headers.location;
          response.destroy(); response = undefined;
          if (redirects >= 5 || typeof location !== 'string') throw fail(502, 'redirect_denied');
          try { url = validateMediaURL(new URL(location, url).href); } catch { throw fail(502, 'redirect_denied'); }
          continue;
        }
        break;
      }
      if (response.statusCode !== 200) throw fail(502, 'upstream_status');
      const type = response.headers['content-type'];
      if (typeof type !== 'string' || !/^(audio\/[a-z0-9.+-]+|application\/octet-stream)(?:\s*;[^\r\n]*)?$/i.test(type)) throw fail(502, 'upstream_type');
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') throw fail(502, 'upstream_encoding');
      const rawLength = response.headers['content-length'];
      if (rawLength !== undefined && (typeof rawLength !== 'string' || !/^\d+$/.test(rawLength))) throw fail(502, 'upstream_length');
      const length = rawLength === undefined ? MAX_FILE : Number(rawLength);
      if (!Number.isSafeInteger(length) || length > MAX_FILE) throw fail(502, 'file_limit');
      state.update(length);
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (rawLength !== undefined) res.setHeader('Content-Length', rawLength);
      let transferred = 0;
      const limiter = new Transform({ transform(chunk, _encoding, callback) {
        transferred += chunk.length;
        callback(transferred > length ? fail(502, 'file_limit') : null, chunk);
      }, flush(callback) { callback(rawLength !== undefined && transferred !== length ? fail(502, 'upstream_length') : null); } });
      await pipeline(response, limiter, res, { signal: controller.signal });
    } catch (err) {
      // Never expose URLs, request bodies, resolver errors or upstream messages.
      send(res, err.status || 502, err.status ? err.message : 'upstream_failed');
    } finally {
      response?.destroy();
      clearTimeout(timer);
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
      controller.signal.removeEventListener('abort', onAbort);
      controller.abort();
      active--;
    }
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 240000;
  server.maxHeadersCount = 32;
  server.once('close', () => state.close());
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const server = createRelay();
    server.on('error', () => { console.error('audio-relay: server_failed'); process.exit(1); });
    server.listen(8791, '127.0.0.1', () => console.log('audio-relay: listening on 127.0.0.1:8791'));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
  } catch { console.error('audio-relay: startup_failed'); process.exitCode = 1; }
}

export function validateMediaURL(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\s\\#]/.test(value) || value.split('/')[2]?.includes('@')) throw new Error('url');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['audio.podigee-cdn.net', 'adswizz.podigee-cdn.net'].includes(url.hostname) || (url.port && url.port !== '443') || url.username || url.password || url.hash || !/\.(mp3|m4a|ogg|oga|wav|aac|flac|opus)$/i.test(url.pathname)) throw new Error('url');
  return url;
}

export function isPublicIPv4(ip) {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}

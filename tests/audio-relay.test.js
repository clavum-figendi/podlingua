import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Readable } from 'node:stream';

const ORIGIN = 'https://clavum-figendi.github.io';
const URL = 'https://audio.podigee-cdn.net/test.mp3';
async function fixture(t, options = {}) {
  const { createRelay } = await import('../server/audio-relay.mjs');
  const dir = await mkdtemp(path.join(process.env.TMPDIR || tmpdir(), 'relay-test-'));
  const statePath = path.join(dir, 'state.json');
  const calls = [];
  const server = createRelay({ statePath, resolve4: async () => ['8.8.8.8'], upstream: async (url, opts) => {
    calls.push({ url, opts });
    return Object.assign(Readable.from([Buffer.from('audio')]), { statusCode: 200, headers: { 'content-type': 'audio/mpeg', 'content-length': '5', 'set-cookie': 'secret=x', location: 'secret' } });
  }, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body = { url: URL }, headers = {}, route = '/fetch') => fetch(base + route, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { server, base, post, calls, statePath };
}

test('loopback relay serves safe health, strict CORS and streamed audio', async t => {
  const f = await fixture(t);
  assert.deepEqual(await (await fetch(f.base + '/health')).json(), { ok: true });
  const pre = await fetch(f.base + '/podlingua-audio/fetch', { method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(pre.headers.get('access-control-allow-methods'), 'POST');
  const res = await f.post(undefined, { cookie: 'private=x', authorization: 'secret' }, '/podlingua-audio/fetch');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'audio');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(res.headers.get('location'), null);
  assert.equal(res.headers.get('access-control-allow-credentials'), null);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(f.calls[0].opts.address, '8.8.8.8');
  assert.equal(f.calls[0].opts.headers, undefined);
  const state = JSON.parse(await readFile(f.statePath, 'utf8'));
  assert.equal(state.reserved, 5);
  for (const origin of ['', 'https://evil.test', ORIGIN + '.evil']) assert.equal((await f.post(undefined, { origin })).status, 403);
  assert.equal((await f.post(undefined, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await f.post('{')).status, 400);
  assert.equal((await f.post('x'.repeat(8193))).status, 413);
  assert.equal((await f.post({ url: 'https://evil.test/a.mp3' })).status, 400);
  assert.equal(f.calls.length, 1);
});

test('URL parser rejects empty fragments and normalized userinfo tricks', async () => {
  const { validateMediaURL } = await import('../server/audio-relay.mjs');
  for (const url of [URL + '#', 'https://@audio.podigee-cdn.net/a.mp3', ' https://audio.podigee-cdn.net/a.mp3', 'https://audio.podigee-cdn.net\\\\a.mp3']) assert.throws(() => validateMediaURL(url), url);
});

function media(chunks = ['audio'], headers = { 'content-type': 'audio/mpeg', 'content-length': '5' }, statusCode = 200) {
  return Object.assign(Readable.from(chunks), { headers, statusCode });
}

test('DNS rejects any unsafe answer and pins lookup in both node callback forms', async t => {
  let calls = 0;
  const denied = await fixture(t, { resolve4: async () => ['8.8.8.8', '127.0.0.1'], upstream: async () => { calls++; return media(); } });
  assert.equal((await denied.post()).status, 502);
  assert.equal(calls, 0);
  const pinned = await fixture(t, { upstream: async (_url, opts) => {
    opts.lookup('ignored', {}, (err, address, family) => { assert.equal(err, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
    opts.lookup('ignored', { all: true }, (err, records) => { assert.equal(err, null); assert.deepEqual(records, [{ address: '8.8.8.8', family: 4 }]); });
    return media();
  } });
  assert.equal(await (await pinned.post()).text(), 'audio');
});

test('redirects are revalidated, resolved each hop and limited to five', async t => {
  for (const location of ['https://evil.test/a.mp3', 'http://audio.podigee-cdn.net/a.mp3', '/page', URL + '#bad']) {
    let calls = 0;
    const f = await fixture(t, { upstream: async () => { calls++; return media([], { location }, 302); } });
    assert.equal((await f.post()).status, 502);
    assert.equal(calls, 1);
  }
  let calls = 0; let resolutions = 0;
  const f = await fixture(t, { resolve4: async () => { resolutions++; return ['8.8.8.8']; }, upstream: async () => {
    calls++; return media([], { location: 'https://adswizz.podigee-cdn.net/next.mp3' }, 302);
  } });
  assert.equal((await f.post()).status, 502);
  assert.equal(calls, 6);
  assert.equal(resolutions, 6);
  let n = 0;
  const good = await fixture(t, { upstream: async () => ++n <= 5 ? media([], { location: '/next.mp3' }, 307) : media() });
  assert.equal(await (await good.post()).text(), 'audio');
});

test('persistent quota survives restart, fails closed on corruption, deletion and IO', async t => {
  const { createRelay, DAILY_BUDGET, MAX_FILE } = await import('../server/audio-relay.mjs');
  const f = await fixture(t);
  await (await f.post()).text();
  await new Promise(resolve => f.server.close(resolve));
  const restarted = createRelay({ statePath: f.statePath });
  await new Promise(resolve => restarted.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => restarted.close(resolve));
  let s = JSON.parse(await readFile(f.statePath, 'utf8'));
  assert.equal(s.reserved, 5);
  const g = await fixture(t, { upstream: async () => media(['x'], { 'content-type': 'audio/mpeg' }) });
  await (await g.post()).text();
  assert.equal(JSON.parse(await readFile(g.statePath, 'utf8')).reserved, MAX_FILE);
  s = JSON.parse(await readFile(g.statePath, 'utf8')); s.reserved = DAILY_BUDGET;
  await writeFile(g.statePath, JSON.stringify(s));
  assert.equal((await g.post()).status, 429);
  await writeFile(g.statePath, '{bad');
  assert.equal((await g.post()).status, 503);
  await rm(g.statePath);
  assert.equal((await g.post()).status, 503);
  await new Promise(resolve => g.server.close(resolve));
  assert.throws(() => createRelay({ statePath: g.statePath }));
  const h = await fixture(t);
  await writeFile(h.statePath + '.tmp', 'blocked');
  assert.equal((await h.post()).status, 503);
  assert.equal(h.calls.length, 0);
  assert.throws(() => createRelay({ statePath: undefined }));
  assert.throws(() => createRelay({ statePath: path.resolve('state-in-repo.json') }));
});

test('60 hourly admissions persist and failures are not retried', async t => {
  let attempts = 0;
  const f = await fixture(t, { upstream: async () => { attempts++; throw new Error('sensitive-url'); } });
  for (let i = 0; i < 60; i++) {
    const res = await f.post(); assert.equal(res.status, 502); assert.doesNotMatch(await res.text(), /sensitive/);
  }
  assert.equal((await f.post()).status, 429);
  assert.equal(attempts, 60);
  assert.equal(JSON.parse(await readFile(f.statePath, 'utf8')).admissions.length, 60);
});

test('rejects oversized declarations, nonaudio, encodings and malformed lengths', async t => {
  const { MAX_FILE } = await import('../server/audio-relay.mjs');
  for (const headers of [
    { 'content-type': 'audio/mpeg', 'content-length': String(MAX_FILE + 1) },
    { 'content-type': 'text/html' },
    { 'content-type': 'audio/mpeg', 'content-encoding': 'gzip' },
    { 'content-type': 'audio/mpeg', 'content-length': '-1' },
  ]) {
    const f = await fixture(t, { upstream: async () => media([], headers) });
    assert.equal((await f.post()).status, 502);
    assert.equal(JSON.parse(await readFile(f.statePath, 'utf8')).reserved, 0);
  }
});

test('stream overrun and truncation fail without refunding reservation', async t => {
  for (const chunks of [['too-long'], []]) {
    const f = await fixture(t, { upstream: async () => media(chunks) });
    await assert.rejects(async () => (await f.post()).arrayBuffer());
    assert.equal(JSON.parse(await readFile(f.statePath, 'utf8')).reserved, 5);
  }
});

test('disconnect aborts upstream, preserves reservation and releases concurrency', async t => {
  let signals = []; let streams = [];
  const f = await fixture(t, { upstream: async (_url, { signal }) => {
    signals.push(signal);
    const stream = Object.assign(new Readable({ read() {} }), { statusCode: 200, headers: { 'content-type': 'audio/mpeg' } });
    streams.push(stream); stream.push(Buffer.from('first')); return stream;
  } });
  const first = await f.post();
  const second = await f.post();
  assert.equal((await f.post()).status, 429);
  await first.body.cancel(); await second.body.cancel();
  for (let i = 0; i < 50 && !streams.every(s => s.destroyed); i++) await new Promise(r => setTimeout(r, 10));
  assert.ok(signals.every(s => s.aborted));
  assert.ok(streams.every(s => s.destroyed));
  const third = await f.post(); assert.equal(third.status, 200); await third.body.cancel();
  assert.equal(JSON.parse(await readFile(f.statePath, 'utf8')).reserved, 3 * 100 * 1024 * 1024);
});

test('total timeout frees admissions even if a resolver never settles', async t => {
  const f = await fixture(t, { timeoutMs: 30, resolve4: async () => new Promise(() => {}) });
  assert.equal((await f.post()).status, 504);
  assert.equal((await f.post()).status, 504);
  assert.equal((await f.post()).status, 504);
});

test('slow uploads are terminated by total timeout and do not retain slots', async t => {
  const f = await fixture(t, { timeoutMs: 30 });
  for (let i = 0; i < 3; i++) {
    const status = await new Promise((resolve, reject) => {
      const req = http.request(f.base + '/fetch', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' } }, res => {
        res.resume(); res.once('end', () => resolve(res.statusCode));
      });
      t.after(() => req.destroy());
      req.on('error', err => { if (err.code !== 'ECONNRESET') reject(err); });
      req.write('{');
    });
    assert.equal(status, 504);
  }
});

test('chunked request limit and preflight denial have no upstream side effects', async t => {
  const f = await fixture(t);
  const response = await new Promise((resolve, reject) => {
    const req = http.request(f.base + '/fetch', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' } }, res => { res.resume(); res.once('end', () => resolve(res)); });
    req.on('error', reject); req.end('x'.repeat(8193));
  });
  assert.equal(response.statusCode, 413);
  assert.equal((await fetch(f.base + '/fetch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: URL }) })).status, 403);
  for (const extra of [{ 'access-control-request-method': 'GET' }, { 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' }]) {
    const res = await fetch(f.base + '/fetch', { method: 'OPTIONS', headers: { origin: ORIGIN, ...extra } });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('access-control-allow-methods'), null);
  }
  assert.equal(f.calls.length, 0);
});

test('actual unknown-length stream stops at 100MiB without buffering or refund', async t => {
  const { MAX_FILE } = await import('../server/audio-relay.mjs');
  let produced = 0;
  const chunk = Buffer.alloc(1024 * 1024);
  const f = await fixture(t, { upstream: async () => media((function* () {
    for (let i = 0; i < 102; i++) { produced++; yield chunk; }
  })(), { 'content-type': 'audio/mpeg' }) });
  const response = await f.post();
  let received = 0;
  await assert.rejects(async () => { for await (const bytes of response.body) received += bytes.length; });
  assert.ok(received <= MAX_FILE);
  assert.ok(produced <= 102);
  assert.equal(JSON.parse(await readFile(f.statePath, 'utf8')).reserved, MAX_FILE);
});

test('persistent hourly window expires, UTC day resets, backwards clock fails closed', async t => {
  let clock = Date.UTC(2026, 10, 17, 23, 30);
  const f = await fixture(t, { now: () => clock });
  await (await f.post()).text();
  let s = JSON.parse(await readFile(f.statePath, 'utf8'));
  s.admissions = Array(60).fill(clock); await writeFile(f.statePath, JSON.stringify(s));
  assert.equal((await f.post()).status, 429);
  clock += 3600001;
  assert.equal(await (await f.post()).text(), 'audio');
  s = JSON.parse(await readFile(f.statePath, 'utf8'));
  assert.equal(s.reserved, 5);
  assert.equal(s.admissions.length, 1);
  assert.equal(s.day, '2026-11-18');
  clock--;
  assert.equal((await f.post()).status, 503);
  const { createRelay } = await import('../server/audio-relay.mjs');
  assert.throws(() => createRelay({ statePath: f.statePath }), /EEXIST/);
});

// Dynamic import makes the initial RED an assertion about missing functionality.
test('strict media URL and public IPv4 policy', async () => {
  const relay = await import('../server/audio-relay.mjs').catch(() => ({}));
  assert.equal(typeof relay.validateMediaURL, 'function');
  const { validateMediaURL, isPublicIPv4 } = relay;
  assert.equal(validateMediaURL('https://audio.podigee-cdn.net/a.mp3?q=x').hostname, 'audio.podigee-cdn.net');
  assert.equal(validateMediaURL('https://adswizz.podigee-cdn.net/a.m4a').protocol, 'https:');
  for (const url of ['http://audio.podigee-cdn.net/a.mp3', 'https://evil.test/a.mp3', 'https://audio.podigee-cdn.net.evil.test/a.mp3', 'https://u:p@audio.podigee-cdn.net/a.mp3', 'https://audio.podigee-cdn.net:444/a.mp3', 'https://audio.podigee-cdn.net/a.mp3#x', 'https://audio.podigee-cdn.net/page', 'https://127.0.0.1/a.mp3']) assert.throws(() => validateMediaURL(url));
  for (const ip of ['0.1.2.3', '10.1.2.3', '100.64.1.1', '127.0.0.1', '169.254.1.1', '172.16.0.1', '192.168.1.1', '192.0.0.9', '192.0.2.1', '198.18.0.1', '198.51.100.2', '203.0.113.2', '224.0.0.1', '240.1.1.1', '255.255.255.255', '::1', '1.2.3']) assert.equal(isPublicIPv4(ip), false, ip);
  assert.equal(isPublicIPv4('8.8.8.8'), true);
});

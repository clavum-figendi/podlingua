// A narrowly scoped BYO-key relay; never an arbitrary URL proxy or shared AI key.
const ORIGIN = 'https://clavum-figendi.github.io';
const INPUT_MAX = 100 * 1024, OUTPUT_MAX = 256 * 1024;
const cors = {'Access-Control-Allow-Origin': ORIGIN, Vary: 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Expose-Headers': 'Retry-After'};
const reply = (status, value, extra = {}) => new Response(JSON.stringify(value), {status, headers: {...cors, 'Content-Type': 'application/json', ...extra}});

// Cancellation is initiated synchronously, but a transport's cleanup promise
// must never hold the response past the request deadline.
function cancel(stream) { try { void stream.cancel().catch(() => {}); } catch {} }

async function abortable(promise, signal) {
  signal.throwIfAborted();
  let abort;
  const stopped = new Promise((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, {once: true}); });
  try { return await Promise.race([promise, stopped]); }
  finally { signal.removeEventListener('abort', abort); }
}
async function jsonLimited(message, max, signal) {
  const reader = message.body?.getReader();
  if (!reader) throw Error('body');
  let size = 0; const chunks = [];
  try {
    while (true) {
      const {done, value} = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > max) throw Error('body_limit');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  } finally { cancel(reader); reader.releaseLock(); }
}
function valid(data) {
  const language = value => typeof value === 'string' && /^[A-Z]{2,3}(?:-[A-Z]{2,4})?$/.test(value);
  return data && typeof data === 'object' && !Array.isArray(data)
    && Object.keys(data).every(k => ['text', 'source_lang', 'target_lang'].includes(k))
    && Array.isArray(data.text) && data.text.length > 0 && data.text.length <= 8
    && data.text.every(t => typeof t === 'string' && t.length <= 4000)
    && language(data.target_lang) && (data.source_lang === undefined || language(data.source_lang));
}
export async function handle(request, env = {}, fetcher = fetch) {
  const url = new URL(request.url), path = url.pathname;
  if (path === '/health' && request.method === 'GET') return reply(200, {ok: true, version: 'translation-cf-1', provider: 'deepl', storesKeys: false});
  if (!['/deepl/free', '/deepl/pro'].includes(path) || url.search) return reply(404, {error: 'not_found'});
  if (request.headers.get('Origin') !== ORIGIN) return reply(403, {error: 'origin_denied'});
  if (request.method === 'OPTIONS') {
    const requested = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(h => h.trim()).filter(Boolean);
    if (request.headers.get('Access-Control-Request-Method') !== 'POST' || requested.some(h => !['authorization', 'content-type'].includes(h))) return reply(403, {error: 'preflight_denied'});
    return new Response(null, {status: 204, headers: {...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type'}});
  }
  if (request.method !== 'POST') return reply(405, {error: 'method_denied'});
  if (!/^application\/json(?:;.*)?$/i.test(request.headers.get('Content-Type') || '')) return reply(415, {error: 'content_type'});
  const auth = request.headers.get('Authorization') || '';
  if (!/^DeepL-Auth-Key [A-Za-z0-9:_-]{1,512}$/.test(auth)) return reply(401, {error: 'own_api_key_required'});
  if (Number(request.headers.get('Content-Length')) > INPUT_MAX) return reply(413, {error: 'body_limit'});
  if (!env.RATE_LIMITER) return reply(503, {error: 'limiter_unavailable'});
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60000)]);
  let upstream;
  try {
    const allowed = await abortable(env.RATE_LIMITER.limit({key: request.headers.get('CF-Connecting-IP') || 'unknown'}), signal);
    if (!allowed.success) return reply(429, {error: 'relay_rate_limit'}, {'Retry-After': '60'});
    let data;
    try { data = await jsonLimited(request, INPUT_MAX, signal); }
    catch(error) { return reply(signal.aborted ? 408 : error.message === 'body_limit' ? 413 : 400, {error: error.message === 'body_limit' ? 'body_limit' : 'invalid_request'}); }
    if (!valid(data)) return reply(400, {error: 'invalid_request'});
    const endpoint = path === '/deepl/free' ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
    upstream = await abortable(fetcher(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: auth}, body: JSON.stringify(data), redirect: 'manual', credentials: 'omit', cache: 'no-store', signal}), signal);
    if (!upstream.ok) {
      const status = [400, 401, 403, 429, 456].includes(upstream.status) ? upstream.status : 502;
      const retry = upstream.headers.get('Retry-After') || '';
      const extra = /^\d{1,6}$/.test(retry) || (retry.length < 128 && Number.isFinite(Date.parse(retry))) ? {'Retry-After': retry} : {};
      return reply(status, {error: `deepl_http_${upstream.status}`}, extra);
    }
    const result = await jsonLimited(upstream, OUTPUT_MAX, signal);
    if (!Array.isArray(result.translations) || result.translations.length !== data.text.length || result.translations.some(t => typeof t?.text !== 'string' || t.text.length > 16000)) return reply(502, {error: 'invalid_provider_response'});
    return reply(200, {translations: result.translations.map(t => ({text: t.text}))});
  } catch { return reply(signal.aborted ? 504 : 502, {error: signal.aborted ? 'translation_timeout' : 'translation_unavailable'}); }
  finally { if (upstream?.body && !upstream.body.locked) cancel(upstream.body); }
}
export default {fetch(request, env) { return handle(request, env); }};

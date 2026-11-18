import test from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../server/cloudflare-translation.mjs';

const origin = 'https://clavum-figendi.github.io';
const payload = {text: ['Hello'], source_lang: 'EN', target_lang: 'FR'};
const req = (data = payload, path = '/deepl/free', extra = {}) => new Request('https://relay.test' + path, {
  method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', Authorization: 'DeepL-Auth-Key test-only', ...extra}, body: JSON.stringify(data),
});
const env = {RATE_LIMITER: {limit: async () => ({success: true})}};

test('translation relay has a narrow authenticated CORS contract and fails closed without its limiter', async () => {
  const response = await handle(new Request('https://relay.test/deepl/free', {method: 'OPTIONS', headers: {Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type'}}), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await handle(req(payload, '/deepl/free', {Origin: 'https://evil.test'}), env)).status, 403);
  assert.equal((await handle(req(), {})).status, 503);
});

test('translation relay uses only fixed DeepL endpoints, validates batches and never forwards cookies or redirects', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push(url);
    assert.equal(init.headers.Authorization, 'DeepL-Auth-Key test-only');
    assert.equal(init.headers.Cookie, undefined);
    assert.equal(init.redirect, 'manual');
    assert.deepEqual(JSON.parse(init.body), payload);
    return Response.json({translations: [{text: 'Bonjour'}]}, {headers: {'Set-Cookie': 'private', 'X-Private': 'discard'}});
  };
  for (const [path, expected] of [['free', 'api-free.deepl.com'], ['pro', 'api.deepl.com']]) {
    const out = await handle(req(payload, '/deepl/' + path), env, fetcher);
    assert.equal(out.status, 200);
    assert.equal(out.headers.get('Cache-Control'), 'no-store');
    assert.equal(out.headers.get('Set-Cookie'), null);
    assert.deepEqual(await out.json(), {translations: [{text: 'Bonjour'}]});
    assert.equal(calls.at(-1), `https://${expected}/v2/translate`);
  }
  for (const bad of [{...payload, url: 'https://evil.test'}, {...payload, text: ['x'.repeat(4001)]}, {...payload, text: Array(9).fill('x')}, {...payload, target_lang: 'FR?bad'}]) {
    assert.equal((await handle(req(bad), env, fetcher)).status, 400);
  }
  assert.equal(calls.length, 2);
  let hops = 0;
  const out = await handle(req(), env, async () => { hops++; return new Response(null, {status: 302, headers: {Location: 'https://evil.test'}}); });
  assert.equal(out.status, 502);
  assert.equal(hops, 1);
});

test('translation relay rate limits before upstream and strips error bodies while exposing Retry-After', async () => {
  let calls = 0;
  const blocked = await handle(req(), {RATE_LIMITER: {limit: async () => ({success: false})}}, async () => { calls++; });
  assert.equal(blocked.status, 429);
  assert.equal(calls, 0);
  const out = await handle(req(), env, async () => { calls++; return new Response('private provider detail test-only', {status: 429, headers: {'Retry-After': '60'}}); });
  assert.equal(out.status, 429);
  assert.equal(out.headers.get('Retry-After'), '60');
  assert.equal(out.headers.get('Access-Control-Expose-Headers'), 'Retry-After');
  assert.doesNotMatch(await out.text(), /test-only/);
  assert.equal(calls, 1);
});

test('streamed size limits and malformed provider JSON are rejected without leaking bodies', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json({translations: [{text: 'Bonjour'}]}); };
  const huge = {...payload, text: Array(8).fill('\u0001'.repeat(4000))};
  assert.equal((await handle(req(huge), env, fetcher)).status, 413);
  assert.equal(calls, 0);
  const oversized = await handle(req(), env, async () => new Response('x'.repeat(256 * 1024 + 1)));
  assert.equal(oversized.status, 502);
  for (const result of [{translations: []}, {translations: [{text: 42}]}, null]) {
    assert.equal((await handle(req(), env, async () => Response.json(result))).status, 502);
  }
});

test('a stalled upstream cancellation cannot keep the handler pending after abort', async () => {
  const control = new AbortController();
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const request = new Request(req(), {signal: control.signal});
  const result = handle(request, env, async () => {
    ready();
    return new Response(new ReadableStream({cancel() { return new Promise(() => {}); }}));
  });
  await started;
  await new Promise(resolve => setImmediate(resolve));
  control.abort();
  let timer;
  try {
    const out = await Promise.race([result, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('handler remained pending after abort')), 2000); })]);
    assert.equal(out.status, 504);
  } finally { clearTimeout(timer); }
});

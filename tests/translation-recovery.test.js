import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTranslationRequest, translate} from '../src/engines.js';

const config = {provider: 'deepl', allowCloud: true, key: 'test-only-key', source: 'en', target: 'fr'};
const doc = {language: 'en', segments: [{start: 0, end: 1, text: 'Hello', speaker: 'A'}]};

test('DeepL official endpoints require explicit relay permission before any network request', async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw new Error('must not fetch'); };
  try {
    await assert.rejects(translate(doc, config), /DeepL.*relay.*permission/i);
    assert.equal(calls, 0);
    const request = buildTranslationRequest({...config, allowTranslationRelay: true}, ['Hello']);
    assert.equal(request.url, 'https://podlingua-translation.clavum-figendi.workers.dev/deepl/free');
    assert.equal(request.headers.Authorization, 'DeepL-Auth-Key test-only-key');
    assert.deepEqual(JSON.parse(request.body), {text: ['Hello'], source_lang: 'EN', target_lang: 'FR'});
    assert.equal(buildTranslationRequest({...config, endpoint: 'https://api.deepl.com/v2/translate', allowTranslationRelay: true}, ['Hello']).url,
      'https://podlingua-translation.clavum-figendi.workers.dev/deepl/pro');
  } finally { globalThis.fetch = original; }
});

test('Mistral 429 stops after one request with quota guidance and Retry-After, without modifying the transcript', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('do not expose provider body', {status: 429, headers: {'Retry-After': '60'}}); };
  try {
    await assert.rejects(translate(doc, {...config, provider: 'mistral'}), error => {
      assert.match(error.message, /Mistral.*429/);
      assert.match(error.message, /60 seconds/);
      assert.match(error.message, /quota|rate.limit/i);
      assert.match(error.message, /on.device/i);
      assert.equal(error.code, 'PROVIDER_RATE_LIMITED');
      assert.equal(error.retryAfterSeconds, 60);
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(doc.segments[0].translation, undefined);
  } finally { globalThis.fetch = original; }
});

test('DeepL batches respect serialized UTF-8 byte limits as well as segment counts', async () => {
  const original = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, init) => {
    assert.ok(new TextEncoder().encode(init.body).length <= 100 * 1024);
    const {text} = JSON.parse(init.body); sent.push(...text);
    return Response.json({translations: text.map((_, i) => ({text: String(sent.length - text.length + i)}))});
  };
  try {
    const segments = Array.from({length: 8}, (_, i) => ({start: i, end: i + 1, text: '\u0001'.repeat(4000)}));
    const out = await translate({language: 'en', segments}, {...config, batchCharacters: 32000, allowTranslationRelay: true});
    assert.equal(sent.length, 8);
    assert.deepEqual(out.segments.map(s => s.translation), ['0', '1', '2', '3', '4', '5', '6', '7']);
  } finally { globalThis.fetch = original; }
});

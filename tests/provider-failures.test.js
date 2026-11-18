import test from 'node:test';
import assert from 'node:assert/strict';
import {translate} from '../src/engines.js';

const config = {provider: 'groq', model: 'account-model', key: 'fixture-secret', allowCloud: true, source: 'en', target: 'fr'};
const doc = {language: 'en', segments: [{start: 0, end: 1, text: 'Hello'}]};

test('provider rejection bodies are consumed and expose safe model/key/payload diagnostics', async () => {
  const original = globalThis.fetch;
  try {
    for (const [provider, status, body, code, message] of [
      ['groq', 404, {error: {code: 'model_not_found', message: 'The model fixture-secret does not exist'}}, 'PROVIDER_MODEL_UNAVAILABLE', /model.*(available|select|catalog)/i],
      ['gemini', 400, {error: {status: 'INVALID_ARGUMENT', message: 'API key not valid. fixture-secret'}}, 'PROVIDER_AUTH', /API key/i],
      ['together', 400, {error: {type: 'invalid_request_error', message: 'max_tokens exceeds context length fixture-secret'}}, 'PROVIDER_CONTEXT_LIMIT', /token|context/i],
      ['deepl', 429, {error: 'relay_rate_limit'}, 'RELAY_RATE_LIMITED', /relay/i],
    ]) {
      let response;
      globalThis.fetch = async () => (response = Response.json(body, {status}));
      await assert.rejects(translate(doc, {...config, provider, allowTranslationRelay: true}), error => {
        assert.equal(error.code, code);
        assert.equal(error.status, status);
        assert.match(error.message, message);
        assert.doesNotMatch(error.message, /fixture-secret/);
        return true;
      });
      assert.equal(response.bodyUsed, true);
    }
  } finally { globalThis.fetch = original; }
});

test('a failed translation reports a resumable checkpoint and retry sends only the missing batches', async () => {
  const original = globalThis.fetch;
  let calls = 0, checkpoint;
  const long = {language: 'en', segments: Array.from({length: 10}, (_, i) => ({start: i, end: i + 1, text: 'Line ' + i}))};
  globalThis.fetch = async (url, init) => {
    calls++;
    if(calls === 2) return Response.json({error: {code: 'service_unavailable'}}, {status: 503});
    const texts = JSON.parse(JSON.parse(init.body).messages.at(-1).content);
    return Response.json({choices: [{message: {content: JSON.stringify(texts.map(t => '[fr] ' + t))}}]});
  };
  try {
    await assert.rejects(translate(long, {...config, provider: 'openai'}, {onCheckpoint: value => { checkpoint = value; }}), /503/);
    assert.equal(checkpoint.translations.length, 8);
    const result = await translate(long, {...config, provider: 'openai'}, {resume: checkpoint});
    assert.equal(calls, 3);
    assert.equal(result.segments[9].translation, '[fr] Line 9');
    assert.equal(long.segments[0].translation, undefined);
  } finally { globalThis.fetch = original; }
});

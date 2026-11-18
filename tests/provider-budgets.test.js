import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTranslationRequest, translate} from '../src/engines.js';
const config = {provider: 'together', model: 'chosen-account-model', key: 'fixture', source: 'en', target: 'fr', allowCloud: true};

test('provider-specific output token budgets are respected and invalid budgets fail before fetch', () => {
  const request = buildTranslationRequest({...config, maxOutputTokens: 1024}, ['Hello']);
  assert.equal(JSON.parse(request.body).max_tokens, 1024);
  assert.throws(() => buildTranslationRequest({...config, maxOutputTokens: -1}, ['Hello']), /tokens|budget/i);
  assert.throws(() => buildTranslationRequest({...config, model: ''}, ['Hello']), /model/i);
});

test('translation batches honor the configured character budget without truncating source segments', async () => {
  const original = globalThis.fetch; const sent = [];
  globalThis.fetch = async (url, init) => {
    const texts = JSON.parse(JSON.parse(init.body).messages.at(-1).content); sent.push(texts);
    return Response.json({choices: [{message: {content: JSON.stringify(texts.map(t => 'translated ' + t.length))}}]});
  };
  try {
    const doc = {language: 'en', segments: Array.from({length: 4}, (_, i) => ({start: i, end: i + 1, text: 'x'.repeat(2000)}))};
    const out = await translate(doc, {...config, batchCharacters: 4000}, {scheduler: {run: async (url, work) => work()}});
    assert.deepEqual(sent.map(batch => batch.length), [2, 2]);
    assert.equal(out.segments.length, 4);
    assert.equal(out.segments[3].text.length, 2000);
  } finally { globalThis.fetch = original; }
});

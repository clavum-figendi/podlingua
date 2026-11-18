import test from 'node:test';
import assert from 'node:assert/strict';
let instance = 0;
async function fresh(stored = {}) {
  const values = new Map([['podlingua-prefs-v2', JSON.stringify(stored)]]);
  globalThis.localStorage = {getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v)};
  return import(`../src/services/prefs.js?provider-memory=${++instance}`);
}

test('switching providers retains their selected models/options and session-only endpoint-scoped keys', async () => {
  const p = await fresh();
  p.setProvider('translation', 'groq');
  p.savePrefs({translation: {model: 'chosen-model', maxOutputTokens: 1024}});
  p.setKey('translation', 'fixture-groq-key');
  p.setProvider('translation', 'mistral');
  assert.equal(p.getKey('translation'), '');
  p.setKey('translation', 'fixture-mistral-key');
  p.setProvider('translation', 'groq');
  assert.equal(p.prefs.translation.model, 'chosen-model');
  assert.equal(p.prefs.translation.maxOutputTokens, 1024);
  assert.equal(p.engineConfig('translation', {model: undefined}).model, 'chosen-model');
  assert.equal(p.getKey('translation'), 'fixture-groq-key');
  p.savePrefs({translation: {endpoint: 'https://custom.example/chat/completions'}});
  assert.equal(p.getKey('translation'), '');
  const saved = JSON.parse(localStorage.getItem('podlingua-prefs-v2'));
  assert.doesNotMatch(JSON.stringify(saved), /fixture-.*-key/);
  const reloaded = await fresh(saved);
  reloaded.setProvider('translation', 'groq');
  assert.equal(reloaded.getKey('translation'), '');
});

test('legacy retired/restricted defaults migrate once, including saved presets, without erasing later explicit choices', async () => {
  const p = await fresh({translation: {provider: 'groq', model: 'llama-3.3-70b-versatile'}, translationPresets: {fireworks: {provider: 'fireworks', model: 'accounts/fireworks/models/llama-v3p3-70b-instruct'}, together: {provider: 'together', endpoint: 'https://api.together.xyz/v1/chat/completions', model: 'my-explicit-model'}}});
  assert.equal(p.prefs.translation.model, '');
  p.setProvider('translation', 'fireworks'); assert.equal(p.prefs.translation.model, '');
  p.setProvider('translation', 'together'); assert.equal(p.prefs.translation.endpoint, 'https://api.together.ai/v1/chat/completions');
  assert.equal(p.prefs.translation.model, 'my-explicit-model');
  p.setProvider('translation', 'groq'); p.savePrefs({translation: {model: 'llama-3.3-70b-versatile'}});
  const reloaded = await fresh(JSON.parse(localStorage.getItem('podlingua-prefs-v2')));
  assert.equal(reloaded.prefs.translation.model, 'llama-3.3-70b-versatile');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {translationProviders, buildTranslationRequest, parseTranslation} from '../src/engines.js';
const cfg = provider => ({provider, key: 'fixture-only', allowCloud: true, source: 'en', target: 'fr', model: 'explicit-account-model'});

test('additional providers are selectable BYO-key adapters, not shared credentials or silent model defaults', () => {
  for(const id of ['nvidia','cerebras','sambanova','deepseek','huggingface']) assert.ok(translationProviders.some(p => p.id === id), id);
  const c = buildTranslationRequest(cfg('cerebras'), ['Hello']);
  assert.equal(c.url, 'https://api.cerebras.ai/v1/chat/completions');
  const d = buildTranslationRequest({...cfg('deepseek'), model: 'deepseek-flash'}, ['Hello']);
  assert.equal(d.url, 'https://api.deepseek.com/chat/completions');
  assert.deepEqual(JSON.parse(d.body).thinking, {type: 'disabled'});
});

test('known CORS-blocked new providers require a trusted configured backend before sending any key', () => {
  for(const id of ['nvidia','sambanova']) assert.throws(() => buildTranslationRequest(cfg(id), ['Hello']), /trusted.*backend/i);
  const request = buildTranslationRequest({...cfg('sambanova'), endpoint: 'https://trusted.example/v1/chat/completions'}, ['Hello']);
  assert.equal(request.url, 'https://trusted.example/v1/chat/completions');
});

test('Hugging Face requires a pinned provider, and OpenRouter explicitly disables provider fallback', () => {
  assert.throws(() => buildTranslationRequest({...cfg('huggingface'), model: 'org/model'}, ['Hello']), /pin|provider/i);
  assert.throws(() => buildTranslationRequest({...cfg('huggingface'), model: 'org/model:fastest'}, ['Hello']), /pin|provider/i);
  const h = buildTranslationRequest({...cfg('huggingface'), model: 'org/model:cohere'}, ['Hello']);
  assert.equal(JSON.parse(h.body).model, 'org/model:cohere');
  assert.equal(JSON.parse(buildTranslationRequest(cfg('openrouter'), ['Hello']).body).provider.allow_fallbacks, false);
});

test('NVIDIA Riva translation uses its documented language-pair prompt and plain-text response, one segment at a time', () => {
  const c = {...cfg('nvidia'), endpoint: 'https://trusted.example/v1/chat/completions', model: 'nvidia/riva-translate-4b-instruct-v2'};
  const body = JSON.parse(buildTranslationRequest(c, ['Hello']).body);
  assert.equal(body.messages[0].content, 'en-fr');
  assert.equal(body.messages[1].content, 'Hello');
  assert.deepEqual(parseTranslation('nvidia', {choices: [{message: {content: 'Bonjour'}}]}, 1, c), ['Bonjour']);
  assert.throws(() => buildTranslationRequest(c, ['Hello', 'World']), /one|single|segment/i);
  assert.throws(() => buildTranslationRequest({...c, source: 'auto'}, ['Hello']), /source|language/i);
});

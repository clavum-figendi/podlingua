import test from 'node:test';
import assert from 'node:assert/strict';
import {listProviderModels} from '../src/provider-models.js';
const cfg = {provider: 'groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', key: 'fixture-only'};

test('model discovery requires its own permission, sends only the key to the selected endpoint and filters unsafe IDs', async () => {
  let calls = 0;
  const fetchFn = async (url, init) => {
    calls++; assert.equal(url, 'https://api.groq.com/openai/v1/models');
    assert.equal(init.method, 'GET'); assert.equal(init.headers.Authorization, 'Bearer fixture-only');
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.equal(init.body, undefined);
    return Response.json({data: [{id: 'available-chat', active: true}, {id: 'retired-chat', active: false}, {id: '<script>'}, {id: 'available-chat'}]});
  };
  await assert.rejects(listProviderModels(cfg, {fetchFn}), /permission/i);
  assert.equal(calls, 0);
  const out = await listProviderModels({...cfg, allowModelList: true}, {fetchFn});
  assert.deepEqual(out.models.map(m => m.id), ['available-chat']);
});

test('Gemini discovery handles pagination and only offers generateContent models without leaking keys into URLs', async () => {
  const urls = [];
  const out = await listProviderModels({...cfg, provider: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent', allowModelList: true}, {fetchFn: async (url, init) => {
    urls.push(url); assert.equal(init.headers['x-goog-api-key'], 'fixture-only'); assert.ok(!url.includes('fixture-only'));
    return Response.json(urls.length === 1 ? {models: [{name: 'models/embed-only', supportedGenerationMethods: ['embedContent']}], nextPageToken: 'page two'} : {models: [{name: 'models/account-flash', displayName: 'Account Flash', supportedGenerationMethods: ['generateContent']}]});
  }});
  assert.equal(urls.length, 2);
  assert.match(urls[1], /pageToken=page\+two/);
  assert.deepEqual(out.models.map(m => m.id), ['account-flash']);
});

test('discovery rejects redirects and uses a custom compatible endpoint rather than leaking its key to a preset host', async () => {
  const out = await listProviderModels({...cfg, endpoint: 'https://my.example/compat/v1/chat/completions', allowModelList: true}, {fetchFn: async (url, init) => {
    assert.equal(url, 'https://my.example/compat/v1/models'); assert.equal(init.redirect, 'error');
    return Response.json([{id: 'my-model', type: 'chat'}]);
  }});
  assert.equal(out.models[0].id, 'my-model');
});

test('Together uses the serverless v2 catalog, inference name and cursor rather than project IDs', async () => {
  const urls = [];
  const out = await listProviderModels({...cfg, provider: 'together', endpoint: 'https://api.together.ai/v1/chat/completions', allowModelList: true}, {fetchFn: async url => {
    urls.push(url); const parsed = new URL(url);
    assert.equal(parsed.pathname, '/v2/supported-models');
    assert.equal(parsed.searchParams.get('product'), 'PRODUCT_SERVERLESS');
    assert.equal(parsed.searchParams.get('modality'), 'MODALITY_TEXT');
    return Response.json(urls.length === 1 ? {data: [{id: 'internal-uuid', name: 'org/current-chat', products: ['PRODUCT_SERVERLESS'], capabilities: ['CAPABILITY_CHAT']}], next_cursor: 'cursor-two'} : {data: []});
  }});
  assert.equal(new URL(urls[1]).searchParams.get('after'), 'cursor-two');
  assert.deepEqual(out.models.map(m => m.id), ['org/current-chat']);
});

test('Fireworks uses its native serverless catalog and resource names, never a guessed inference /models', async () => {
  const out = await listProviderModels({...cfg, provider: 'fireworks', endpoint: 'https://api.fireworks.ai/inference/v1/chat/completions', allowModelList: true}, {fetchFn: async url => {
    const parsed = new URL(url); assert.equal(parsed.pathname, '/v1/accounts/fireworks/models');
    assert.equal(parsed.searchParams.get('filter'), 'supports_serverless=true');
    return Response.json({models: [{name: 'accounts/fireworks/models/current-chat', supportsServerless: true}, {name: 'accounts/fireworks/models/old-dedicated', supportsServerless: false}]});
  }});
  assert.deepEqual(out.models.map(m => m.id), ['accounts/fireworks/models/current-chat']);
});

test('Hugging Face catalog choices pin a live provider instead of enabling automatic provider failover', async () => {
  const out = await listProviderModels({...cfg, provider: 'huggingface', endpoint: 'https://router.huggingface.co/v1/chat/completions', allowModelList: true}, {fetchFn: async () => Response.json({data: [{id: 'org/translation-model', providers: [{provider: 'cohere', status: 'live', is_free: false}, {provider: 'offline', status: 'staging'}]}]})});
  assert.deepEqual(out.models.map(m => m.id), ['org/translation-model:cohere']);
});

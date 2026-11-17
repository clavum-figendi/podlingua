import test from 'node:test';
import assert from 'node:assert/strict';
import { asrProviders, translationProviders } from '../src/engines.js';

test('provider catalog covers every existing adapter with dated official evidence', async () => {
  const { providerInfo, getProviderInfo } = await import('../src/provider-info.js');
  const expected = [...asrProviders.map(p => `asr:${p.id}`), ...translationProviders.map(p => `translation:${p.id}`)];
  assert.deepEqual(providerInfo.map(p => `${p.kind}:${p.id}`).sort(), expected.sort());
  assert.equal(new Set(providerInfo.map(p => `${p.kind}:${p.id}`)).size, providerInfo.length);
  for (const p of providerInfo) {
    assert.equal(getProviderInfo(p.kind, p.id), p);
    assert.equal(p.integration, 'integrated');
    assert.match(p.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    for (const key of ['name','hosting','auth','offer','offerType','privacy','limitations','speakerSupport','browserCors']) assert.ok(p[key], `${p.id}.${key}`);
    assert.ok(p.sources.length);
    for (const s of p.sources) { assert.equal(new URL(s.url).protocol, 'https:'); assert.ok(s.title); }
  }
  assert.equal(getProviderInfo('asr', 'not-real'), undefined);
});

test('local model list matches worker allowlist and records exact upstream licenses', async () => {
  const { localModels } = await import('../src/provider-info.js');
  const { readFile } = await import('node:fs/promises');
  const worker = await readFile(new URL('../src/inference-worker.js', import.meta.url), 'utf8');
  assert.equal(localModels.length, 7);
  assert.equal(new Set(localModels.map(m => m.id)).size, 7);
  for (const m of localModels) {
    assert.ok(worker.includes(m.id), m.id);
    assert.equal(m.downloadRequired, true);
    assert.equal(m.hosting, 'browser-offline');
    assert.ok(m.sources.length && m.downloadSize && m.memory);
    assert.ok(['MIT', 'Apache-2.0', 'CC-BY-4.0'].includes(m.upstreamLicense), m.id);
    if (m.source) assert.ok(m.target && m.source !== m.target);
  }
  assert.equal(localModels.find(m => m.id === 'Xenova/opus-mt-en-de').upstreamLicense, 'CC-BY-4.0');
});

test('free labels, diarization and unsupported extras cannot imply integration', async () => {
  const { providerInfo, providerExtras, getProviderInfo } = await import('../src/provider-info.js');
  const mymemory = getProviderInfo('translation','mymemory');
  assert.equal(mymemory.keyRequired, false);
  assert.match(mymemory.offer, /5,000 characters\/day/);
  assert.match(mymemory.offer, /500 UTF-8 bytes/);
  assert.match(mymemory.offer, /does not send de/);
  assert.equal(getProviderInfo('translation','libretranslate').auth, 'instance-dependent');
  assert.equal(getProviderInfo('translation','deepl').browserCors, 'blocked-by-provider');
  assert.equal(getProviderInfo('asr','openai').diarization, false);
  assert.equal(getProviderInfo('asr','together').diarization, false);
  for (const id of ['deepgram','assemblyai','gladia','speechmatics']) {
    const p = getProviderInfo('asr', id);
    assert.equal(p.diarization, true);
    assert.equal(p.speakerSupport, 'audio-diarization');
    assert.ok(p.settings.includes('diarization'));
  }
  for (const p of providerInfo.filter(p => p.kind === 'translation')) assert.equal(p.speakerSupport, 'not-applicable');
  for (const extra of providerExtras) {
    assert.equal(extra.integration, 'not-integrated');
    assert.ok(extra.sources.length && extra.limitations);
    assert.equal(getProviderInfo(extra.kind, extra.id), undefined);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'podlingua-prefs-v2';
let instance = 0;
async function loadPreferences(stored) {
  const values = new Map(stored === undefined ? [] : [[KEY, JSON.stringify(stored)]]);
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  return import(`../src/services/prefs.js?speaker-test=${++instance}`);
}

test('speaker separation defaults on for each integrated diarization provider', async () => {
  const {prefs, setProvider, engineConfig} = await loadPreferences();
  assert.equal(prefs.diarization, true);
  for (const provider of ['deepgram', 'assemblyai', 'gladia', 'speechmatics']) {
    setProvider('asr', provider);
    assert.equal(engineConfig('asr').diarization, true, provider);
  }
});

test('effective configuration never requests speakers from unsupported adapters or translation', async () => {
  const {setProvider, engineConfig} = await loadPreferences();
  for (const provider of ['local', 'openai', 'groq', 'together', 'custom']) {
    setProvider('asr', provider);
    assert.equal(engineConfig('asr').diarization, false, provider);
    assert.equal(engineConfig('asr', {diarization: true}).diarization, false, provider);
  }
  setProvider('asr', 'deepgram');
  assert.equal(engineConfig('asr', {provider: 'local'}).diarization, false);
  assert.equal(engineConfig('asr', {provider: 'unknown', diarization: true}).diarization, false);
  assert.equal(engineConfig('translation', {provider: 'deepgram', diarization: true}).diarization, false);
});

test('existing v2 preferences without a speaker choice inherit the enabled default', async () => {
  const {prefs, engineConfig} = await loadPreferences({asr: {provider: 'deepgram'}, target: 'fr'});
  assert.equal(prefs.diarization, true);
  assert.equal(engineConfig('asr').diarization, true);
  assert.equal(prefs.target, 'fr');
});

test('legacy default false migrates to the newly requested enabled default', async () => {
  const {prefs, setProvider, engineConfig} = await loadPreferences({diarization: false});
  for (const provider of ['deepgram', 'assemblyai', 'gladia', 'speechmatics']) {
    setProvider('asr', provider);
    assert.equal(prefs.diarization, true);
    assert.equal(engineConfig('asr').diarization, true, provider);
  }
});

test('explicit speaker opt-out survives reload and provider changes', async () => {
  const first = await loadPreferences();
  first.setProvider('asr', 'deepgram');
  first.savePrefs({diarization: false});
  const saved = JSON.parse(localStorage.getItem(KEY));
  assert.equal(saved.diarization, false);
  const reloaded = await loadPreferences(saved);
  reloaded.setProvider('asr', 'local');
  reloaded.setProvider('asr', 'gladia');
  assert.equal(reloaded.engineConfig('asr').diarization, false);
  reloaded.savePrefs({diarization: true});
  assert.equal(reloaded.engineConfig('asr').diarization, true);
  assert.equal(reloaded.engineConfig('asr', {diarization: false}).diarization, false);
});

import {asrProviders, translationProviders} from '../engines.js';
import {getProviderInfo} from '../provider-info.js';

// Non-secret preferences persist in localStorage. API keys and cloud-transfer consent never leave memory.
const KEY = 'podlingua-prefs-v2';
const primary = tag => String(tag || '').toLowerCase().split('-')[0];
const browserLanguage = primary(globalThis.navigator?.language) || 'en';
export const LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'sv', 'da', 'no', 'fi', 'pl', 'cs', 'ro', 'hu', 'el', 'tr', 'ru', 'uk', 'ar', 'he', 'fa', 'hi', 'bn', 'zh', 'ja', 'ko', 'vi', 'th', 'id', 'ms', 'ca'];
export const OPUS_PAIRS = {'en-fr': 'Xenova/opus-mt-en-fr', 'fr-en': 'Xenova/opus-mt-fr-en', 'en-de': 'Xenova/opus-mt-en-de', 'de-en': 'Xenova/opus-mt-de-en'};
export const LOCAL_MODELS = [
  {kind: 'asr', id: 'Xenova/whisper-tiny', name: 'Whisper Tiny', note: 'Fastest'},
  {kind: 'asr', id: 'Xenova/whisper-base', name: 'Whisper Base', note: 'More accurate · more memory'},
  ...Object.entries(OPUS_PAIRS).map(([pair, id]) => ({kind: 'translation', id, name: `OPUS ${pair.replace('-', ' → ')}`, note: '~110 MB'})),
  {kind: 'translation', id: 'Xenova/m2m100_418M', name: 'M2M100', note: '100 languages · ~630 MB'},
];
export const AUTO_MODEL = 'auto';

const defaults = () => ({
  asr: {provider: 'local', model: 'Xenova/whisper-tiny', endpoint: '', region: ''},
  translation: {provider: 'local', model: AUTO_MODEL, endpoint: '', region: ''},
  source: 'auto', target: browserLanguage,
  maxUploadMB: 100, timeoutSeconds: 900, diarization: true, speakerPreferenceVersion: 1, offlineOnly: false, allowDownload: false,
  reader: {layout: 'stacked', size: 20, timestamps: true, speakers: true, follow: true},
  onboarded: false,
});

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}'), base = defaults();
    // Adopt the newly requested default for legacy v2 records, whose false was
    // written even without a user choice. Subsequent opt-outs retain version 1.
    if(stored.speakerPreferenceVersion !== 1){stored.diarization = true; stored.speakerPreferenceVersion = 1;}
    return {...base, ...stored, asr: {...base.asr, ...stored.asr}, translation: {...base.translation, ...stored.translation}, reader: {...base.reader, ...stored.reader}};
  } catch { return defaults(); }
}

export const prefs = load();
const secrets = {asr: '', translation: ''};
const session = {allowCloud: false};
const listeners = new Set();
export const onPrefs = fn => (listeners.add(fn), () => listeners.delete(fn));

export function savePrefs(patch = {}) {
  for (const [key, value] of Object.entries(patch)) {
    prefs[key] = value && typeof value === 'object' && !Array.isArray(value) ? {...prefs[key], ...value} : value;
  }
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* Private mode: settings stay for this session. */ }
  for (const fn of listeners) fn(prefs);
}

export const providers = kind => kind === 'asr' ? asrProviders : translationProviders;
export const providerOf = kind => providers(kind).find(p => p.id === prefs[kind].provider) || providers(kind)[0];
export function setProvider(kind, id) {
  const p = providers(kind).find(x => x.id === id);
  if (!p) throw new Error('Unknown provider.');
  secrets[kind] = '';
  savePrefs({[kind]: {provider: id, model: id === 'local' && kind === 'translation' ? AUTO_MODEL : p.model, endpoint: p.endpoint, region: ''}});
}
export const getKey = kind => secrets[kind];
export const setKey = (kind, value) => { secrets[kind] = String(value || ''); };
export const cloudAllowed = () => session.allowCloud;
export const allowCloud = value => { session.allowCloud = value === true; };

/** Picks the smallest on-device translation model able to serve the language pair. */
export function resolveLocalTranslationModel(source, target, chosen = prefs.translation.model) {
  if (chosen && chosen !== AUTO_MODEL) return chosen;
  return OPUS_PAIRS[`${primary(source)}-${primary(target)}`] || 'Xenova/m2m100_418M';
}

export function engineConfig(kind, overrides = {}) {
  const p = prefs[kind], source = overrides.source ?? prefs.source, target = overrides.target ?? prefs.target;
  const model = p.provider === 'local' && kind === 'translation' ? resolveLocalTranslationModel(source, target) : p.model;
  const config = {
    provider: p.provider, model, endpoint: p.endpoint, region: p.region, key: secrets[kind], source, target,
    allowCloud: session.allowCloud, allowDownload: prefs.allowDownload, offlineOnly: prefs.offlineOnly,
    maxUploadMB: prefs.maxUploadMB, timeoutSeconds: prefs.timeoutSeconds, diarization: prefs.diarization, ...overrides,
  };
  const info = getProviderInfo(kind, config.provider);
  config.diarization = kind === 'asr' && info?.integration === 'integrated' && info?.diarization === true && config.diarization === true;
  return config;
}

const names = (() => { try { return new Intl.DisplayNames([globalThis.navigator?.language || 'en'], {type: 'language'}); } catch { return null; } })();
export const languageName = code => !code || code === 'auto' ? 'Detect' : names?.of(code) || code;

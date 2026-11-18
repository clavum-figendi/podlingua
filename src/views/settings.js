import {html, on, bytes, pickFiles, downloadBlob} from '../ui/dom.js';
import {icon} from '../ui/icons.js';
import {segmented, toggle, iconBtn, ring} from '../ui/parts.js';
import {toast, ask} from '../ui/feedback.js';
import {store, reload} from '../services/store.js';
import {prefs, savePrefs, providers, providerOf, setProvider, getKey, setKey, LOCAL_MODELS, AUTO_MODEL} from '../services/prefs.js';
import * as library from '../services/library.js';
import {offline, enable as enableOffline, install} from '../services/offline.js';
import {previewSync, applySync, pushSync} from '../services/sync.js';
import {setFeedAuthentication, clearFeedAuthentication} from '../connections.js';
import {prepareLocalModel} from '../engines.js';
import {providerInfo, getProviderInfo, PROVIDERS_VERIFIED_AT} from '../provider-info.js';
import {QUEUE_SORTS, ENQUEUE_POSITIONS, saveQueuePreferences} from '../parity.js';
import {languageSelect} from './sheets.js';

/** Podcast Index credentials live only in this page's memory. */
export const indexKeys = {apiKey: '', apiSecret: ''};
const MODEL_CACHE = 'podlingua-models-v1';
const ui = {backupAudio: false, storage: null, models: {}, modelJob: null, guide: 'all', sync: {kind: 'nextcloud', server: '', username: '', password: '', device: 'podlingua', consent: false, removeLocal: false, preview: null, status: ''}, auth: {scope: '', username: '', password: '', consent: false}, feedFileUrl: ''};
const rerender = () => window.dispatchEvent(new Event('podlingua:render'));
const s = () => store.state.settings || {};
const group = (glyph, title, body, open = false) => html`<details class="group" ${open ? 'open' : ''}><summary>${icon(glyph)}<span>${title}</span>${icon('down')}</summary><div class="group-body">${body}</div></details>`;
const field = (label, control, hint = '') => html`<label class="field"><span>${label}</span>${control}${hint ? html`<small>${hint}</small>` : ''}</label>`;
const number = (key, value, min, max, step = 1) => html`<input type="number" min="${min}" max="${max}" step="${step}" value="${value}" data-change="set-number" data-key="${key}">`;

async function scanModels() {
  try {
    const keys = await (await caches.open(MODEL_CACHE)).keys();
    for (const m of LOCAL_MODELS) ui.models[m.id] = keys.some(r => new URL(r.url).pathname.includes(`/${m.id}/`)) ? 'cached' : 'missing';
  } catch { for (const m of LOCAL_MODELS) ui.models[m.id] = 'missing'; }
  rerender();
}
async function measureStorage() {
  try { ui.storage = await navigator.storage.estimate(); ui.storage.persisted = await navigator.storage.persisted?.(); } catch { ui.storage = null; }
  rerender();
}

function engine(kind) {
  const p = providerOf(kind), info = getProviderInfo(kind, p.id), local = p.id === 'local';
  const models = LOCAL_MODELS.filter(m => m.kind === kind);
  return html`
    ${field('Service', html`<select data-change="set-provider" data-kind="${kind}">${providers(kind).map(x => html`<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.name}</option>`)}</select>`, info?.offer)}
    ${local ? field('Model', html`<select data-change="set-engine" data-kind="${kind}" data-key="model">${kind === 'translation' ? html`<option value="${AUTO_MODEL}" ${prefs[kind].model === AUTO_MODEL ? 'selected' : ''}>Best for the language pair</option>` : ''}${models.map(m => html`<option value="${m.id}" ${prefs[kind].model === m.id ? 'selected' : ''}>${m.name} · ${m.note}</option>`)}</select>`)
      : html`${field('Model', html`<input value="${prefs[kind].model}" data-change="set-engine" data-kind="${kind}" data-key="model" spellcheck="false">`)}
        ${field('Endpoint', html`<input type="url" value="${prefs[kind].endpoint}" data-change="set-engine" data-kind="${kind}" data-key="endpoint" spellcheck="false">`)}
        ${field('API key', html`<input type="password" autocomplete="off" value="${getKey(kind)}" data-input="set-key" data-kind="${kind}">`, 'Kept in memory until you reload. Never saved or exported.')}
        ${p.id === 'microsoft' ? field('Region', html`<input value="${prefs[kind].region}" data-change="set-engine" data-kind="${kind}" data-key="region">`) : ''}`}
    ${kind === 'asr' ? toggle('set-diarization', prefs.diarization && !!info?.diarization, 'Label speakers', info?.diarization ? 'On by default. Separates voices, not identities. Provider add-on charges may apply.' : 'Not available with this service.') : ''}
    ${info ? html`<details class="fine"><summary>Privacy & limits</summary><p>${info.privacy}</p><p>${info.limitations}</p>${info.sources.map(src => html`<a href="${src.url}" target="_blank" rel="noopener noreferrer">${src.title}</a>`)}</details>` : ''}`;
}

function modelList() {
  return html`<ul class="list models">${LOCAL_MODELS.map(m => {
    const status = ui.models[m.id], job = ui.modelJob?.id === m.id ? ui.modelJob : null;
    return html`<li>
      <span class="model-icon">${job ? ring(job.progress) : icon(status === 'cached' ? 'saved' : m.kind === 'asr' ? 'wave' : 'translate')}</span>
      <span class="grow"><strong>${m.name}</strong><small>${job ? job.message : status === 'cached' ? 'On this device' : m.note}</small></span>
      ${job ? iconBtn('close', 'Cancel', 'model-cancel') : status === 'cached'
        ? html`${iconBtn('check', 'Verify offline', 'model-verify', {id: m.id})}${iconBtn('trash', 'Remove', 'model-remove', {id: m.id})}`
        : iconBtn('download', 'Download', 'model-download', {id: m.id}, ui.modelJob ? 'disabled' : '')}
    </li>`;
  })}</ul>`;
}

function guide() {
  const filters = {all: () => true, free: p => ['free-tier', 'trial-credit', 'keyless-free', 'local-free'].includes(p.offerType), keyless: p => p.keyRequired === false, speakers: p => p.diarization};
  return html`<div class="chips">${[['all', 'All'], ['free', 'Free tier'], ['keyless', 'No key'], ['speakers', 'Speakers']].map(([id, label]) => html`<button type="button" class="chip ${ui.guide === id ? 'on' : ''}" data-act="guide-filter" data-id="${id}">${label}</button>`)}</div>
    <div class="guide">${providerInfo.filter(filters[ui.guide]).map(p => html`<article class="guide-card">
      <header>${icon(p.hosting === 'browser-offline' ? 'device' : 'cloud')}<strong>${p.name}</strong><span class="chip static">${p.kind === 'asr' ? 'Speech' : 'Text'}</span></header>
      <p class="small">${p.offer}</p>
      <div class="row-end">${p.sources.slice(0, 1).map(src => html`<a class="small" href="${src.url}" target="_blank" rel="noopener noreferrer">${icon('external')}Source</a>`)}<button type="button" class="btn small" data-act="guide-use" data-kind="${p.kind}" data-id="${p.id}">Use</button></div>
    </article>`)}</div>
    <p class="fineprint">Checked ${PROVIDERS_VERIFIED_AT}. Offers change; set spending limits with your provider.</p>`;
}

function render() {
  const st = s(), theme = st.theme || 'system', sync = ui.sync;
  const used = ui.storage ? ui.storage.usage / Math.max(1, ui.storage.quota) : 0;
  return html`<div class="page settings">
    <header class="page-head"><h1>Settings</h1></header>

    <section class="card-group">
      <div class="set-row">${icon('auto')}<span class="grow">Appearance</span>${segmented('set-theme', theme, [['system', 'Auto', 'auto'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']])}</div>
      <div class="set-row">${icon('translate')}<span class="grow">Languages</span>
        <div class="lang-pair compact"><label class="lang">${icon('wave')}${languageSelect('set-source', prefs.source, true, 'Language you listen to')}</label><span class="pair-link on" aria-hidden="true">${icon('right')}</span><label class="lang">${icon('translate')}${languageSelect('set-target', prefs.target, false, 'Translate into')}</label></div></div>
      <div class="set-row">${icon('wave')}<span class="grow">Transcribe on</span>${segmented('set-mode-asr', providerOf('asr').id === 'local' ? 'local' : 'online', [['local', 'Device', 'device'], ['online', 'Online', 'cloud']])}</div>
      <div class="set-row">${icon('translate')}<span class="grow">Translate on</span>${segmented('set-mode-translation', providerOf('translation').id === 'local' ? 'local' : 'online', [['local', 'Device', 'device'], ['online', 'Online', 'cloud']])}</div>
    </section>

    <section class="card-group">
      <div class="set-row">${icon('back')}<span class="grow">Skip back</span><select data-change="set-number" data-key="skipBack" aria-label="Skip back seconds">${[5, 10, 15, 30, 60].map(v => html`<option value="${v}" ${(st.skipBack ?? 10) === v ? 'selected' : ''}>${v} s</option>`)}</select></div>
      <div class="set-row">${icon('forward')}<span class="grow">Skip forward</span><select data-change="set-number" data-key="skipForward" aria-label="Skip forward seconds">${[10, 15, 30, 45, 60, 90].map(v => html`<option value="${v}" ${(st.skipForward ?? 30) === v ? 'selected' : ''}>${v} s</option>`)}</select></div>
      ${toggle('set-flag-followQueue', st.followQueue !== false, 'Play the queue continuously')}
      ${toggle('set-flag-rememberPosition', st.rememberPosition !== false, 'Resume where I left off')}
    </section>

    <section class="card-group">
      <div class="set-row">${icon('offline')}<span class="grow">Work offline<small>${offline.ready ? 'App saved on this device' : offline.message || 'Keeps the app usable without a connection'}</small></span>
        ${offline.busy ? ring(null) : html`<button type="button" class="btn small ${offline.ready ? 'ghost' : ''}" data-act="offline-enable">${offline.ready ? 'Repair' : 'Enable'}</button>`}</div>
      ${offline.installable ? html`<div class="set-row">${icon('install')}<span class="grow">Install app</span><button type="button" class="btn small" data-act="app-install">Install</button></div>` : ''}
      <div class="set-row">${icon('storage')}<span class="grow">Storage<small>${ui.storage ? `${bytes(ui.storage.usage)} of ${bytes(ui.storage.quota)}${ui.storage.persisted ? ' · protected' : ''}` : 'Unknown'}</small><span class="meter"><i style="width:${(used * 100).toFixed(1)}%"></i></span></span></div>
      <div class="set-row">${icon('archive')}<span class="grow">Backup<small>Shows, episodes, progress and transcripts</small></span>
        <label class="check small"><input type="checkbox" data-change="backup-audio" ${ui.backupAudio ? 'checked' : ''}>Include audio</label>
        ${iconBtn('download', 'Export backup', 'backup-export')}${iconBtn('upload', 'Restore backup', 'backup-restore')}</div>
    </section>

    <details class="advanced"><summary>${icon('sliders')}<span>Advanced</span>${icon('down')}</summary>
      ${group('wave', 'Speech recognition', engine('asr'))}
      ${group('translate', 'Translation', engine('translation'))}
      ${group('device', 'On-device models', html`${modelList()}${toggle('set-offline-only', prefs.offlineOnly, 'Use downloaded models only', 'Never contacts model hosts; missing models fail.')}<p class="fineprint">Models come from Hugging Face. Browser storage may evict them.</p>`)}
      ${group('globe', 'Service guide', guide())}
      ${group('cpu', 'Processing limits', html`<div class="grid-2">${field('Max upload (MB)', html`<input type="number" min="1" max="2000" value="${prefs.maxUploadMB}" data-change="set-pref-number" data-key="maxUploadMB">`)}${field('Timeout (s)', html`<input type="number" min="1" max="7200" value="${prefs.timeoutSeconds}" data-change="set-pref-number" data-key="timeoutSeconds">`)}</div>`)}
      ${group('refresh', 'Library automation', html`
        <div class="grid-2">
          ${field('Refresh shows every', html`<select data-change="set-number" data-key="refreshMinutes">${[[0, 'Manually'], [30, '30 min'], [60, '1 hour'], [180, '3 hours'], [720, '12 hours'], [1440, 'Day']].map(([v, t]) => html`<option value="${v}" ${(st.refreshMinutes || 0) === v ? 'selected' : ''}>${t}</option>`)}</select>`)}
          ${field('Keep downloads', number('autoDownloadLimit', st.autoDownloadLimit ?? 3, 0, 100), 'Automatic download limit')}
          ${field('Max file size (MB)', number('maxDownloadMB', st.maxDownloadMB ?? 100, 1, 512))}
          ${field('Default speed', number('defaultSpeed', st.defaultSpeed ?? 1, 0.25, 4, 0.05))}
        </div>
        ${toggle('set-flag-autoDownload', !!st.autoDownload, 'Download new episodes', 'Only for shows that allow it, while the app is open.')}
        ${toggle('set-flag-enqueueDownloaded', !!st.enqueueDownloaded, 'Queue downloaded episodes')}
        ${toggle('set-flag-autoDeletePlayed', !!st.autoDeletePlayed, 'Delete downloads after playing')}
        ${toggle('set-flag-skipCompleted', !!st.skipCompleted, 'Skip played episodes in the queue')}
        ${toggle('set-flag-includeExplicit', st.includeExplicit !== false, 'Show explicit episodes')}`)}
      ${group('queue', 'Queue', html`
        ${toggle('queue-locked', !!st.queueLocked, 'Lock the queue')}
        ${toggle('queue-sorted', !!st.queueKeepSorted, 'Keep the queue sorted')}
        <div class="grid-2">
          ${field('Sort by', html`<select data-change="queue-sort">${QUEUE_SORTS.map(v => html`<option value="${v}" ${(st.queueSort || 'newest') === v ? 'selected' : ''}>${v}</option>`)}</select>`)}
          ${field('Add new items', html`<select data-change="queue-position">${ENQUEUE_POSITIONS.map(v => html`<option value="${v}" ${(st.enqueuePosition || 'back') === v ? 'selected' : ''}>${v.replace('-', ' ')}</option>`)}</select>`)}
        </div>`)}
      ${group('discover', 'Directories & network', html`
        <div class="grid-2">${field('Chart country', html`<input value="${st.country || ''}" placeholder="${(navigator.language.split('-')[1] || 'US').toUpperCase()}" maxlength="2" data-change="set-country">`)}</div>
        ${field('Podcast Index key', html`<input type="password" autocomplete="off" value="${indexKeys.apiKey}" data-input="index-key" data-key="apiKey">`)}
        ${field('Podcast Index secret', html`<input type="password" autocomplete="off" value="${indexKeys.apiSecret}" data-input="index-key" data-key="apiSecret">`, html`Your own keys from <a href="https://api.podcastindex.org/" target="_blank" rel="noopener noreferrer">podcastindex.org</a>, kept in memory only.`)}
        ${field('CORS proxy', html`<input type="url" value="${st.proxy || ''}" placeholder="https://proxy.example/?url={url}" data-change="set-proxy" spellcheck="false">`, 'Your own HTTPS proxy for feeds that block browsers.')}
        ${toggle('set-allow-proxy', !!st.allowProxy, 'Send feed requests through this proxy')}`)}
      ${group('sync', 'Sync (gpodder / Nextcloud)', html`
        <div class="grid-2">
          ${field('Protocol', html`<select data-change="sync-field" data-key="kind">${[['nextcloud', 'Nextcloud gpoddersync'], ['gpodder', 'gpodder API v2']].map(([v, t]) => html`<option value="${v}" ${sync.kind === v ? 'selected' : ''}>${t}</option>`)}</select>`)}
          ${field('Server', html`<input type="url" value="${sync.server}" placeholder="https://cloud.example" data-input="sync-field" data-key="server">`)}
          ${field('Username', html`<input autocomplete="off" value="${sync.username}" data-input="sync-field" data-key="username">`)}
          ${field('Password', html`<input type="password" autocomplete="off" value="${sync.password}" data-input="sync-field" data-key="password">`)}
          ${field('Device', html`<input value="${sync.device}" data-input="sync-field" data-key="device">`)}
        </div>
        ${toggle('sync-consent', sync.consent, 'Allow transfers to this server', 'Sends feed addresses and positions. Server must allow CORS.')}
        ${toggle('sync-remove', sync.removeLocal, 'Apply unfollows from the server')}
        <div class="action-row"><button type="button" class="btn small" data-act="sync-preview">${icon('download')}Check server</button><button type="button" class="btn small" data-act="sync-apply" ${sync.preview ? '' : 'disabled'}>${icon('check')}Apply</button><button type="button" class="btn small ghost" data-act="sync-push">${icon('upload')}Upload mine</button></div>
        ${sync.status ? html`<p class="hint">${icon('info')}${sync.status}</p>` : ''}`)}
      ${group('lock', 'Private feeds', html`
        ${field('Address or folder', html`<input type="url" value="${ui.auth.scope}" placeholder="https://publisher.example/private/" data-input="auth-field" data-key="scope">`)}
        <div class="grid-2">${field('Username', html`<input autocomplete="off" value="${ui.auth.username}" data-input="auth-field" data-key="username">`)}${field('Password', html`<input type="password" autocomplete="off" value="${ui.auth.password}" data-input="auth-field" data-key="password">`)}</div>
        ${toggle('auth-consent', ui.auth.consent, 'Send these credentials to this address')}
        <div class="action-row"><button type="button" class="btn small" data-act="auth-save">${icon('key')}Use for this session</button><button type="button" class="btn small ghost" data-act="auth-clear">Forget</button></div>
        <p class="fineprint">Download authenticated episodes before playing them.</p>`)}
      ${group('rss', 'Import a feed file', html`
        ${field('Original feed address', html`<input type="url" value="${ui.feedFileUrl}" placeholder="https://publisher.example/feed.xml" data-input="feedfile-url">`)}
        <button type="button" class="btn small" data-act="feedfile-import">${icon('upload')}Choose RSS / Atom file</button>`)}
      ${group('history', 'History & statistics', html`<div class="action-row"><button type="button" class="btn small ghost" data-act="history-clear">${icon('history')}Clear history</button><button type="button" class="btn small ghost danger-text" data-act="stats-reset">${icon('stats')}Reset statistics</button></div>`)}
      ${group('info', 'About', html`<p>Podlingua is an independent, open-source podcast player with on-device transcription and translation. Not affiliated with AntennaPod or any provider.</p>
        <div class="link-row"><a class="chip" href="./CREDITS.html">${icon('file')}Credits & licenses</a><a class="chip" href="./PROVIDERS.md">${icon('globe')}Provider notes</a><a class="chip" href="https://github.com/clavum-figendi/podlingua" target="_blank" rel="noopener">${icon('external')}Source (GPL-3.0)</a></div>`)}
    </details>
  </div>`;
}

const setSettings = patch => library.saveSettings(patch);
const queuePref = patch => saveQueuePreferences(patch, store.episodes).then(reload);
on('change', {
  'set-theme': el => setSettings({theme: el.value}),
  'set-source': el => savePrefs({source: el.value}),
  'set-target': el => savePrefs({target: el.value}),
  'set-mode-asr': el => setProvider('asr', el.value === 'local' ? 'local' : prefs.asrHosted || 'groq'),
  'set-mode-translation': el => setProvider('translation', el.value === 'local' ? 'local' : prefs.translationHosted || 'deepl'),
  'set-provider': el => { setProvider(el.dataset.kind, el.value); if (el.value !== 'local') savePrefs({[`${el.dataset.kind}Hosted`]: el.value}); },
  'set-engine': el => savePrefs({[el.dataset.kind]: {[el.dataset.key]: el.value.trim()}}),
  'set-diarization': el => savePrefs({diarization: el.checked}),
  'set-offline-only': el => savePrefs({offlineOnly: el.checked}),
  'set-pref-number': el => { const v = Number(el.value); if (Number.isFinite(v) && v >= Number(el.min) && v <= Number(el.max)) savePrefs({[el.dataset.key]: v}); else toast(`Use a value from ${el.min} to ${el.max}.`, {error: true}); },
  'set-number': el => setSettings({[el.dataset.key]: Number(el.value)}),
  ...Object.fromEntries(['followQueue', 'rememberPosition', 'autoDownload', 'enqueueDownloaded', 'autoDeletePlayed', 'skipCompleted', 'includeExplicit'].map(key => [`set-flag-${key}`, el => setSettings({[key]: el.checked})])),
  'queue-locked': el => queuePref({queueLocked: el.checked}),
  'queue-sorted': el => queuePref({queueKeepSorted: el.checked}),
  'queue-sort': el => queuePref({queueSort: el.value}),
  'queue-position': el => queuePref({enqueuePosition: el.value}),
  'set-country': el => { const v = el.value.trim().toUpperCase(); if (v && !/^[A-Z]{2}$/.test(v)) throw new Error('Use a two-letter country code.'); return setSettings({country: v || undefined}); },
  'set-proxy': el => { const v = el.value.trim(); if (v && (!v.startsWith('https://') || !v.includes('{url}'))) throw new Error('Use an https:// proxy address containing {url}.'); return setSettings({proxy: v, ...(v ? {} : {allowProxy: false})}); },
  'set-allow-proxy': el => { if (el.checked && !s().proxy) { el.checked = false; throw new Error('Enter a proxy address first.'); } return setSettings({allowProxy: el.checked}); },
  'backup-audio': el => { ui.backupAudio = el.checked; },
  'sync-field': el => { ui.sync[el.dataset.key] = el.value; ui.sync.preview = null; },
  'sync-consent': el => { ui.sync.consent = el.checked; ui.sync.preview = null; },
  'sync-remove': el => { ui.sync.removeLocal = el.checked; },
  'auth-consent': el => { ui.auth.consent = el.checked; },
});
on('input', {
  'set-key': el => setKey(el.dataset.kind, el.value),
  'index-key': el => { indexKeys[el.dataset.key] = el.value; },
  'sync-field': el => { ui.sync[el.dataset.key] = el.value; ui.sync.preview = null; },
  'auth-field': el => { ui.auth[el.dataset.key] = el.value; },
  'feedfile-url': el => { ui.feedFileUrl = el.value; },
});
on('click', {
  'offline-enable': async () => { await enableOffline(); toast('Podlingua now works offline'); },
  'app-install': () => install(),
  'backup-export': async () => { toast('Preparing backup…'); downloadBlob(await library.backupBlob(ui.backupAudio), `podlingua-backup-${new Date().toISOString().slice(0, 10)}.zip`); },
  'backup-restore': async () => {
    const [file] = await pickFiles({accept: '.zip,.json,application/zip,application/json'});
    if (!file || !await ask('Restore this backup?', {detail: 'Matching items are updated; others are kept. Automatic downloads and proxy access are switched off.', confirm: 'Restore'})) return;
    const data = await library.restoreBackup(file);
    toast(`Restored ${data.episodes.length} episodes and ${data.subscriptions.length} shows`);
  },
  'guide-filter': el => { ui.guide = el.dataset.id; rerender(); },
  'guide-use': el => { setProvider(el.dataset.kind, el.dataset.id); toast(`${providerOf(el.dataset.kind).name} selected`); },
  async 'model-download'(el) { await modelJob(el.dataset.id, false); },
  async 'model-verify'(el) { await modelJob(el.dataset.id, true); },
  'model-cancel': () => ui.modelJob?.controller.abort(),
  async 'model-remove'(el) {
    if (!await ask('Remove this model?', {detail: 'You can download it again later.', confirm: 'Remove', danger: true})) return;
    const cache = await caches.open(MODEL_CACHE);
    for (const request of await cache.keys()) if (new URL(request.url).pathname.includes(`/${el.dataset.id}/`)) await cache.delete(request);
    await scanModels(); toast('Model removed');
  },
  async 'sync-preview'() {
    const preview = await previewSync({...ui.sync});
    Object.assign(ui.sync, {preview, status: `${preview.subscriptions.add.length} shows, ${preview.subscriptions.remove.length} unfollows, ${preview.actions.actions.length} positions on the server.`});
    rerender();
  },
  async 'sync-apply'() {
    if (!ui.sync.preview || !await ask('Apply server changes?', {detail: 'Follows new shows and updates newer positions.', confirm: 'Apply'})) return;
    const {added, errors} = await applySync(ui.sync.preview, {removeLocal: ui.sync.removeLocal});
    Object.assign(ui.sync, {preview: null, status: `Added ${added} shows${errors.length ? `; ${errors.length} failed` : ''}.`}); rerender();
  },
  async 'sync-push'() {
    if (!await ask(`Upload ${store.feeds.length} shows and your positions?`, {detail: 'Nothing is deleted on the server.', confirm: 'Upload'})) return;
    const {verified} = await pushSync({...ui.sync});
    ui.sync.status = verified ? 'Uploaded and confirmed.' : 'Uploaded, but the server did not confirm every show.'; rerender();
  },
  'auth-save': () => { setFeedAuthentication(ui.auth.scope, ui.auth.username, ui.auth.password, ui.auth.consent); ui.auth.password = ''; toast('Credentials active until reload'); rerender(); },
  'auth-clear': () => { clearFeedAuthentication(); ui.auth.password = ''; toast('Credentials forgotten'); rerender(); },
  async 'feedfile-import'() { const [file] = await pickFiles({accept: '.xml,.rss,.atom'}); if (!file) return; await library.importFeedFile(file, ui.feedFileUrl); toast('Feed imported'); },
  async 'history-clear'() { if (await ask('Clear listening history?', {detail: 'Resume positions and play dates are removed.', confirm: 'Clear', danger: true})) { await library.clearHistory(); toast('History cleared'); } },
  async 'stats-reset'() { if (await ask('Reset statistics?', {detail: 'Listening time counters start from zero.', confirm: 'Reset', danger: true})) { await library.resetStatistics(); toast('Statistics reset'); } },
});

async function modelJob(id, verify) {
  if (ui.modelJob) return;
  const model = LOCAL_MODELS.find(m => m.id === id), controller = new AbortController();
  ui.modelJob = {id, controller, progress: null, message: verify ? 'Checking' : 'Starting'};
  rerender();
  try {
    await prepareLocalModel(model.kind, id, {signal: controller.signal, offlineOnly: verify, onProgress: p => { if (Number.isFinite(p.progress)) ui.modelJob.progress = p.progress; ui.modelJob.message = verify ? 'Checking' : `Downloading${Number.isFinite(p.progress) ? ` ${Math.round(p.progress)}%` : ''}`; rerender(); }});
    if (!verify) await prepareLocalModel(model.kind, id, {signal: controller.signal, offlineOnly: true});
    toast(`${model.name} is ready offline`);
  } catch (error) { if (!controller.signal.aborted) throw error; } finally { ui.modelJob = null; await scanModels(); }
}

export default {render, title: () => 'Settings', enter() { scanModels(); measureStorage(); }};

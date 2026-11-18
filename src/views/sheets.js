import {html, on, clock, duration, shortDate, plainText, safeHref, pickFiles, downloadBlob, go} from '../ui/dom.js';
import {icon} from '../ui/icons.js';
import {cover, iconBtn, ring, toggle as switchControl} from '../ui/parts.js';
import {openSheet, refreshSheet, closeSheet, toast, ask} from '../ui/feedback.js';
import {store, feedOf, coverOf, showTitle, inQueue} from '../services/store.js';
import * as library from '../services/library.js';
import {jobs, enqueue, cancel, retry, dismiss, activeJob, failedJob, jobLabel} from '../services/jobs.js';
import {prefs, savePrefs, engineConfig, providers, providerOf, setProvider, getKey, setKey, allowCloud, LANGUAGES, languageName, resolveLocalTranslationModel} from '../services/prefs.js';
import {player, media, load, removeBookmark} from '../services/player.js';
import {episodeShare} from '../episode-sharing.js';
import {fetchRelayAudio, supportsAudioRelay, AUDIO_RELAY_ENDPOINT} from '../audio-relay-client.js';
import {needsDeepLRelay} from '../engines.js';
import {providerModelControls, modelReady} from './provider-controls.js';

const close = html`<button type="button" class="icon-btn sheet-close" data-act="sheet-close" aria-label="Close">${icon('close')}</button>`;
const languageOptions = (value, withAuto) => html`${withAuto ? html`<option value="auto" ${value === 'auto' ? 'selected' : ''}>Detect</option>` : ''}${[...new Set([...LANGUAGES, value].filter(v => v && v !== 'auto'))].map(code => html`<option value="${code}" ${code === value ? 'selected' : ''}>${languageName(code)}</option>`)}`;
export const languageSelect = (name, value, withAuto = false, label = '') => html`<select data-change="${name}" aria-label="${label || name}">${languageOptions(value, withAuto)}</select>`;

/* ---------- Episode ---------- */
let episodeId = null;
export function openEpisode(id) { episodeId = id; openSheet(renderEpisode); }
function step(e, kind) {
  const job = activeJob(e.id), failed = failedJob(e.id), done = kind === 'asr' ? !!e.doc : !!e.doc?.targetLanguage;
  const working = job && (kind === 'asr' ? ['download', 'publisher', 'asr'] : ['translate']).includes(job.kind);
  const label = kind === 'asr' ? 'Transcript' : 'Translation';
  return html`<div class="step ${done ? 'step-done' : ''}">
    <span class="step-icon">${working ? ring(job.status === 'running' ? job.progress : 0) : icon(done ? 'check' : kind === 'asr' ? 'transcript' : 'translate')}</span>
    <span class="step-text"><strong>${label}</strong><small>${working ? `${jobLabel(job)}${job.message ? ' · ' + job.message : ''}` : done ? (kind === 'asr' ? `${e.doc.segments.length} lines · ${languageName(e.doc.language)}` : languageName(e.doc.targetLanguage)) : failed && (kind === 'asr') === (failed.kind !== 'translate') ? failed.error : kind === 'translate' && !e.doc ? 'Needs a transcript' : 'Not yet'}</small></span>
    ${working ? html`<button type="button" class="btn small ghost" data-act="job-cancel" data-id="${e.id}">Cancel</button>`
      : html`${kind === 'translate' && failed?.kind === 'translate' && failed.resume?.translations?.length ? html`<button type="button" class="btn small" data-act="job-retry" data-id="${failed.id}" title="Resume with original provider, model and languages">Resume</button>` : ''}<button type="button" class="btn small ${done ? 'ghost' : ''}" data-act="process" data-id="${e.id}" data-kind="${kind}" ${kind === 'translate' && !e.doc ? 'disabled' : ''}>${done ? 'Redo' : kind === 'asr' ? 'Create' : 'Translate'}</button>`}
  </div>`;
}
function renderEpisode() {
  const e = store.byId.get(episodeId);
  if (!e) return html`${close}<p class="muted">This episode was removed.</p>`;
  const feed = feedOf(e), playing = player.id === e.id && !media.paused, notes = plainText(e.description);
  const resumeAt = !e.played && e.position > 5 ? e.position : 0;
  return html`${close}
    <header class="sheet-hero">
      ${cover(coverOf(e), showTitle(e) || e.title, 'xl')}
      <div>
        ${feed ? html`<button type="button" class="link kicker" data-act="sheet-show" data-id="${feed.id}">${feed.title}</button>` : html`<span class="kicker">${showTitle(e)}</span>`}
        <h2>${e.title}</h2>
        <p class="muted">${[shortDate(e.published || e.createdAt), duration(e.duration), e.played ? 'Played' : ''].filter(Boolean).join('  ·  ')}</p>
      </div>
    </header>
    <div class="action-row">
      <button type="button" class="btn primary" data-act="play" data-id="${e.id}" ${!e.audio && !e.audioUrl ? 'disabled' : ''}>${icon(playing ? 'pause' : 'play')}${playing ? 'Pause' : resumeAt ? `Resume ${clock(resumeAt)}` : 'Play'}</button>
      <button type="button" class="btn" data-act="sheet-read" data-id="${e.id}">${icon('transcript')}Read along</button>
    </div>
    <div class="icon-row">
      ${iconBtn(inQueue(e.id) ? 'queued' : 'queue', inQueue(e.id) ? 'In queue' : 'Queue', 'queue-toggle', {id: e.id}, `labelled ${inQueue(e.id) ? 'on' : ''}`)}
      ${e.audio ? iconBtn('saved', 'Saved', 'sheet-undownload', {id: e.id}, 'labelled on') : e.audioUrl ? iconBtn('download', 'Download', 'sheet-download', {id: e.id}, 'labelled') : ''}
      ${iconBtn(e.favorite ? 'heartFill' : 'heart', e.favorite ? 'Loved' : 'Love', 'sheet-flag', {id: e.id, key: 'favorite'}, `labelled ${e.favorite ? 'on' : ''}`)}
      ${iconBtn('played', e.played ? 'Played' : 'Mark played', 'sheet-flag', {id: e.id, key: 'played'}, `labelled ${e.played ? 'on' : ''}`)}
      ${iconBtn('share', 'Share', 'sheet-share', {id: e.id}, 'labelled')}
      ${iconBtn('more', 'More', 'sheet-more', {id: e.id}, 'labelled')}
    </div>
    <section class="steps">${step(e, 'asr')}${step(e, 'translate')}</section>
    ${notes ? html`<details class="notes" ${notes.length < 400 ? 'open' : ''}><summary>Show notes</summary><p>${notes}</p></details>` : ''}
    ${e.chapters?.length ? html`<details class="notes"><summary>Chapters</summary><ol class="chapter-list">${e.chapters.map(c => html`<li><button type="button" class="link" data-act="sheet-chapter" data-id="${e.id}" data-at="${c.start}"><span>${clock(c.start)}</span>${c.title || 'Chapter'}</button></li>`)}</ol></details>` : ''}
    <div class="link-row">
      ${safeHref(e.website) ? html`<a class="chip" href="${safeHref(e.website)}" target="_blank" rel="noopener noreferrer">${icon('external')}Website</a>` : ''}
      ${(e.socialLinks || []).filter(l => safeHref(l.url)).map(l => html`<a class="chip" href="${safeHref(l.url)}" target="_blank" rel="noopener noreferrer">${icon('globe')}${l.protocol || 'Discuss'}</a>`)}
    </div>`;
}

let moreFor = null;
function renderMore() {
  const e = store.byId.get(moreFor);
  if (!e) return close;
  return html`${close}<h2 class="sheet-title">${e.title}</h2>
    <div class="menu">
      ${e.transcripts?.length ? html`<button type="button" data-act="sheet-publisher" data-id="${e.id}">${icon('transcript')}Use publisher transcript</button>` : ''}
      <button type="button" data-act="sheet-import-transcript" data-id="${e.id}">${icon('file')}Import transcript file</button>
      <button type="button" data-act="sheet-attach" data-id="${e.id}">${icon('upload')}Attach audio file</button>
      <button type="button" data-act="sheet-bookmarks" data-id="${e.id}">${icon('bookmark')}Bookmarks${e.bookmarks?.length ? ` (${e.bookmarks.length})` : ''}</button>
      <button type="button" data-act="sheet-flag" data-id="${e.id}" data-key="archived">${icon('archive')}${e.archived ? 'Unarchive' : 'Archive'}</button>
      ${e.audio && e.audioUrl ? html`<button type="button" data-act="sheet-undownload" data-id="${e.id}">${icon('trash')}Remove download</button>` : ''}
      <button type="button" class="danger" data-act="sheet-delete" data-id="${e.id}">${icon('trash')}Delete from library</button>
    </div>`;
}

function renderBookmarks() {
  const e = store.byId.get(moreFor);
  const marks = e?.bookmarks || [];
  return html`${close}<h2 class="sheet-title">${icon('bookmark')}Bookmarks</h2>
    ${marks.length ? html`<ul class="list">${marks.map(m => html`<li><button type="button" class="link" data-act="sheet-chapter" data-id="${e.id}" data-at="${m.position}"><span class="time">${clock(m.position)}</span>${m.label || shortDate(m.createdAt)}</button>${iconBtn('close', 'Remove bookmark', 'bookmark-remove', {id: e.id, mark: m.id})}</li>`)}</ul>` : html`<p class="muted">Tap ${icon('bookmark')} in the player to mark a moment.</p>`}`;
}

/* ---------- Process (transcribe / translate) ---------- */
const flow = {id: null, kind: 'asr', source: 'auto', target: 'fr', translate: true, method: 'local', publisher: false};
export function openProcess(id, kind = 'asr') {
  const e = store.byId.get(id);
  if (!e) return;
  const feedLanguage = String(feedOf(e)?.language || '').toLowerCase().split('-')[0];
  Object.assign(flow, {
    id, kind, relayConsent: false,
    source: e.doc?.language && !['auto', 'unknown', 'und'].includes(e.doc.language) ? e.doc.language : prefs.source !== 'auto' ? prefs.source : LANGUAGES.includes(feedLanguage) ? feedLanguage : 'auto',
    target: prefs.target, translate: true,
    publisher: kind === 'asr' && !!e.transcripts?.length,
  });
  if (flow.target === flow.source) flow.target = LANGUAGES.find(code => code !== flow.source && code === String(navigator.language).split('-')[0]) || (flow.source === 'en' ? 'fr' : 'en');
  openSheet(renderProcess);
}
function engineChoice(kind) {
  const p = providerOf(kind), local = p.id === 'local';
  const hosted = providers(kind).filter(x => x.id !== 'local');
  const keyMissing = !local && !getKey(kind) && !['custom', 'ollama', 'libretranslate', 'mymemory'].includes(p.id);
  return html`<div class="choice">
    <label class="${local ? 'on' : ''}"><input type="radio" name="engine-${kind}" value="local" data-change="flow-engine" data-kind="${kind}" ${local ? 'checked' : ''}>${icon('device')}<span><strong>This device</strong><small>Private · free</small></span></label>
    <label class="${local ? '' : 'on'}"><input type="radio" name="engine-${kind}" value="online" data-change="flow-engine" data-kind="${kind}" ${local ? '' : 'checked'}>${icon('cloud')}<span><strong>Online</strong><small>${local ? 'Faster · your API key' : p.name}</small></span></label>
  </div>
  ${local ? '' : html`<div class="inline-fields">
    <select data-change="flow-provider" data-kind="${kind}" aria-label="Online service">${hosted.map(x => html`<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.name}</option>`)}</select>
    <input type="password" autocomplete="off" placeholder="API key (kept until reload)" value="${getKey(kind)}" data-input="flow-key" data-kind="${kind}" aria-label="${p.name} API key">
  </div>${keyMissing ? html`<p class="hint">${icon('key')}Add a key, or open Settings › Advanced for endpoints.</p>` : ''}${kind === 'translation' ? providerModelControls(kind) : ''}`}`;
}
function renderProcess() {
  const e = store.byId.get(flow.id);
  if (!e) return close;
  const job = activeJob(e.id);
  const needsAudio = flow.kind === 'asr' && !flow.publisher && !e.audio;
  const asrLocal = providerOf('asr').id === 'local', trLocal = providerOf('translation').id === 'local';
  const doTranslate = flow.kind === 'translate' || flow.translate;
  const relayRequired = doTranslate && providerOf('translation').id === 'deepl' && needsDeepLRelay(prefs.translation.endpoint);
  const sourceMissing = doTranslate && trLocal && flow.source === 'auto' && !(flow.kind === 'translate' && e.doc?.language && !['auto', 'unknown', 'und'].includes(e.doc.language));
  const blocked = (needsAudio && !e.audioUrl) || sourceMissing || (flow.kind === 'translate' && !e.doc) || (relayRequired && !flow.relayConsent) || (doTranslate && !modelReady('translation'));
  const steps = [
    ...(needsAudio ? [['download', 'Get audio']] : []),
    ...(flow.kind === 'asr' ? [[flow.publisher ? 'transcript' : 'wave', flow.publisher ? 'Publisher transcript' : 'Transcribe']] : []),
    ...(doTranslate ? [['translate', `To ${languageName(flow.target)}`]] : []),
  ];
  const notices = [
    ...((flow.kind === 'asr' && !flow.publisher && asrLocal) || (doTranslate && trLocal) ? ['Downloads open models from Hugging Face the first time.'] : []),
    ...(flow.kind === 'asr' && !flow.publisher && !asrLocal ? [`Sends the audio to ${providerOf('asr').name}.`] : []),
    ...(flow.kind === 'asr' && !flow.publisher && engineConfig('asr').diarization ? ['Speaker labels are requested; provider add-on charges may apply.'] : []),
    ...(doTranslate && !trLocal ? [`Sends the text to ${providerOf('translation').name}.`] : []),
  ];
  return html`${close}
    <h2 class="sheet-title">${icon(flow.kind === 'asr' ? 'transcript' : 'translate')}${flow.kind === 'asr' ? 'Read along' : 'Translate'}</h2>
    <div class="mini-ep">${cover(coverOf(e), showTitle(e) || e.title, 'sm')}<span><strong>${e.title}</strong><small>${showTitle(e)}</small></span></div>
    <div class="lang-pair">
      <label class="lang">${icon('wave')}<span class="sr">Spoken language</span>${languageSelect('flow-source', flow.source, true, 'Spoken language')}</label>
      ${flow.kind === 'asr' ? html`<button type="button" class="pair-link ${flow.translate ? 'on' : ''}" data-act="flow-translate" aria-pressed="${flow.translate}" title="${flow.translate ? 'Also translate' : 'Transcript only'}">${icon('right')}</button>` : html`<span class="pair-link on">${icon('right')}</span>`}
      <label class="lang ${doTranslate ? '' : 'off'}">${icon('translate')}<span class="sr">Translate into</span>${languageSelect('flow-target', flow.target, false, 'Translate into')}</label>
    </div>
    ${sourceMissing ? html`<p class="hint warn">${icon('info')}Pick the spoken language for on-device translation.</p>` : ''}
    ${flow.kind === 'asr' && e.transcripts?.length ? html`<div class="choice">
      <label class="${flow.publisher ? 'on' : ''}"><input type="radio" name="words" value="publisher" data-change="flow-words" ${flow.publisher ? 'checked' : ''}>${icon('transcript')}<span><strong>Publisher</strong><small>Instant · no model</small></span></label>
      <label class="${flow.publisher ? '' : 'on'}"><input type="radio" name="words" value="speech" data-change="flow-words" ${flow.publisher ? '' : 'checked'}>${icon('wave')}<span><strong>Speech recognition</strong><small>From the audio</small></span></label>
    </div>` : ''}
    ${flow.kind === 'asr' && !flow.publisher ? html`<h3 class="mini-heading">Transcribe on</h3>${engineChoice('asr')}` : ''}
    ${doTranslate ? html`<h3 class="mini-heading">Translate on</h3>${engineChoice('translation')}` : ''}
    ${relayRequired ? html`<div class="callout"><strong>DeepL needs a browser relay</strong><p class="small">DeepL blocks direct browser calls. Podlingua's Cloudflare receives the text and your DeepL API key, forwards them only to DeepL, and does not store them. Your DeepL API allowance applies; no automatic retry or provider switch.</p><label class="check"><input type="checkbox" data-change="flow-relay-consent" ${flow.relayConsent ? 'checked' : ''}>Allow DeepL relay for this operation</label></div>` : ''}
    <ol class="pipeline" aria-label="Steps">${steps.map(([glyph, label]) => html`<li>${icon(glyph)}<span>${label}</span></li>`)}</ol>
    ${needsAudio && !e.audioUrl ? html`<button type="button" class="btn wide" data-act="sheet-attach" data-id="${e.id}">${icon('upload')}Attach audio file</button>` : ''}
    ${job ? html`<div class="job-line">${ring(job.status === 'running' ? job.progress : 0)}<span>${jobLabel(job)}${job.message ? ' · ' + job.message : ''}</span><button type="button" class="btn small ghost" data-act="job-cancel" data-id="${e.id}">Cancel</button></div>`
      : html`<button type="button" class="btn primary wide" data-act="flow-start" ${blocked ? 'disabled' : ''}>${icon('play')}Start</button>
        ${notices.length ? html`<p class="fineprint">${notices.join(' ')} Starting confirms this.</p>` : ''}`}`;
}

function processSteps(e) {
  const steps = [], doTranslate = flow.kind === 'translate' || flow.translate;
  const relayRequired = doTranslate && providerOf('translation').id === 'deepl' && needsDeepLRelay(prefs.translation.endpoint);
  if(relayRequired && !flow.relayConsent)throw new Error('Confirm permission for the DeepL Cloudflare relay first.');
  if(doTranslate && !modelReady('translation'))throw new Error('Select a supported translation model first.');
  const source = flow.source;
  savePrefs({source: flow.source === 'auto' ? prefs.source : flow.source, target: flow.target});
  const cloud = kind => providerOf(kind).id !== 'local';
  if ((flow.kind === 'asr' && !flow.publisher && cloud('asr')) || (doTranslate && cloud('translation'))) allowCloud(true);
  if (flow.kind === 'asr') {
    if (flow.publisher) steps.push({kind: 'publisher'});
    else {
      if (!e.audio) steps.push({kind: 'download'});
      steps.push({kind: 'asr', config: engineConfig('asr', {source, allowDownload: true, allowCloud: cloud('asr')})});
    }
  }
  if (doTranslate) {
    const trSource = source === 'auto' ? e.doc?.language || 'auto' : source;
    steps.push({kind: 'translate', config: engineConfig('translation', {source: trSource, target: flow.target, allowTranslationRelay: relayRequired && flow.relayConsent, allowDownload: true, allowCloud: cloud('translation'), model: providerOf('translation').id === 'local' ? resolveLocalTranslationModel(trSource, flow.target) : undefined})});
  }
  return steps;
}

/* ---------- Audio help (publisher blocks direct download) ---------- */
let helpId = null, relay = null;
export function openAudioHelp(id) { helpId = id; openSheet(renderHelp, {onClose: () => relay?.controller.abort()}); }
function renderHelp() {
  const e = store.byId.get(helpId);
  if (!e) return close;
  const canRelay = AUDIO_RELAY_ENDPOINT && supportsAudioRelay(e.audioUrl);
  return html`${close}<h2 class="sheet-title">${icon('download')}Get the audio</h2>
    <p class="muted">${e.title}: the publisher doesn't allow direct copying in the browser.</p>
    ${canRelay ? html`<div class="callout">
        <strong>${icon('zap')}Fetch it for me</strong>
        <p class="small">Passes the recording through Podlingua's Cloudflare relay (selected hosts, up to 100 MB). Nothing is stored or sent to AI services.</p>
        ${relay ? html`<div class="job-line">${ring(relay.progress)}<span>${relay.message}</span><button type="button" class="btn small ghost" data-act="relay-cancel">Cancel</button></div>`
          : html`<button type="button" class="btn primary wide" data-act="relay-start">${icon('download')}Use relay</button>`}
      </div>` : ''}
    <div class="numbered">
      <div><span>1</span><p><a href="${safeHref(e.audioUrl)}" target="_blank" rel="noopener noreferrer">Open the recording ${icon('external')}</a> and save it from the browser menu.</p></div>
      <div><span>2</span><p>Attach the saved file. Your progress and transcript are kept.</p></div>
    </div>
    <div class="action-row">
      <button type="button" class="btn" data-act="sheet-attach" data-id="${e.id}">${icon('upload')}Attach file</button>
      <button type="button" class="btn ghost" data-act="help-retry">${icon('refresh')}Try again</button>
      ${e.transcripts?.length ? html`<button type="button" class="btn ghost" data-act="sheet-publisher" data-id="${e.id}">${icon('transcript')}Publisher transcript</button>` : ''}
    </div>`;
}

/* ---------- Share ---------- */
const share = {id: null, withTime: false};
export function openShare(id) { Object.assign(share, {id, withTime: player.id === id}); openSheet(renderShare); }
function renderShare() {
  const e = store.byId.get(share.id);
  if (!e) return close;
  const payload = episodeShare({...e, link: e.website}, player.id === e.id ? media.currentTime : e.position, share.withTime);
  return html`${close}<h2 class="sheet-title">${icon('share')}Share</h2>
    <textarea class="share-preview" rows="4" readonly aria-label="Share text">${payload.text}</textarea>
    ${switchControl('share-time', share.withTime, 'Include position')}
    <p class="fineprint">Publisher links can contain private subscription tokens.</p>
    <div class="action-row">
      ${typeof navigator.share === 'function' ? html`<button type="button" class="btn primary" data-act="share-native">${icon('share')}Share</button>` : ''}
      <button type="button" class="btn" data-act="share-copy">${icon('link')}Copy</button>
      ${e.audio ? html`<button type="button" class="btn ghost" data-act="share-file">${icon('download')}Save audio</button>` : ''}
    </div>`;
}

/* ---------- Activity ---------- */
export function openActivity() { openSheet(renderActivity); }
function renderActivity() {
  const statusIcon = {done: 'check', error: 'alert', cancelled: 'close'};
  return html`${close}<h2 class="sheet-title">${icon('wave')}Activity</h2>
    ${jobs.length ? html`<ul class="list jobs">${[...jobs].reverse().map(j => html`<li class="job-${j.status}">
      ${j.status === 'running' || j.status === 'queued' ? ring(j.status === 'running' ? j.progress : 0) : icon(statusIcon[j.status])}
      <span class="grow"><strong>${jobLabel(j)}</strong><small>${j.title}${j.status === 'running' && j.message ? ' · ' + j.message : ''}${j.error ? ' · ' + j.error : ''}${j.status === 'queued' ? ' · Waiting' : ''}${j.status !== 'done' && j.resume?.translations?.length ? ` · ${j.resume.translations.length} translated lines kept in this tab` : ''}</small></span>
      ${j.status === 'error' || (j.status === 'cancelled' && j.kind === 'translate' && j.resume?.translations?.length) ? iconBtn('refresh', j.resume?.translations?.length ? 'Resume' : 'Retry', 'job-retry', {id: j.id}) : ''}
      ${j.status === 'error' && j.code === 'MEDIA_NETWORK_BLOCKED' ? iconBtn('upload', 'Get audio', 'job-help', {id: j.episodeId}) : ''}
      ${j.status === 'running' || j.status === 'queued' ? iconBtn('close', 'Cancel', 'job-cancel', {id: j.episodeId}) : iconBtn('close', 'Dismiss', 'job-dismiss', {id: j.id})}
    </li>`)}</ul>` : html`<p class="muted">Nothing running.</p>`}`;
}

/* ---------- Show settings ---------- */
let showId = null;
export function openShowSettings(id) { showId = id; openSheet(renderShowSettings); }
function renderShowSettings() {
  const f = store.feeds.find(x => x.id === showId);
  if (!f) return close;
  return html`${close}<h2 class="sheet-title">${icon('sliders')}Show settings</h2>
    <form class="form" data-submit="show-save">
      <label>Name<input name="title" value="${f.titleOverride || f.title}" maxlength="300" required></label>
      <label>Tags<input name="tags" value="${(f.tags || []).join(', ')}" placeholder="news, french"></label>
      <div class="grid-3">
        <label>${icon('speed')}Speed<input name="speed" type="number" min="0.25" max="4" step="0.05" value="${Number(f.speed) || 1}"></label>
        <label>Skip intro (s)<input name="skipIntro" type="number" min="0" max="86400" value="${Number(f.skipIntro) || 0}"></label>
        <label>Skip outro (s)<input name="skipOutro" type="number" min="0" max="86400" value="${Number(f.skipOutro) || 0}"></label>
      </div>
      <label>New episodes<select name="newEpisodeAction">${[['inbox', 'Show in New'], ['queue', 'Add to queue'], ['nothing', 'Do nothing']].map(([v, t]) => html`<option value="${v}" ${(f.newEpisodeAction || 'inbox') === v ? 'selected' : ''}>${t}</option>`)}</select></label>
      <label class="check"><input type="checkbox" name="keepUpdated" ${f.keepUpdated !== false ? 'checked' : ''}>Refresh automatically</label>
      <label class="check"><input type="checkbox" name="autoDownload" ${f.autoDownload ? 'checked' : ''}>Download new episodes automatically</label>
      <div class="grid-2">
        <label>Only titles with<input name="downloadInclude" value="${f.downloadInclude || ''}" placeholder='lesson "slow news"'></label>
        <label>Skip titles with<input name="downloadExclude" value="${f.downloadExclude || ''}" placeholder="trailer"></label>
      </div>
      <p class="fineprint">Automatic work runs only while Podlingua is open; turn it on in Settings › Library.</p>
      <button class="btn primary wide">${icon('check')}Save</button>
    </form>`;
}

/* ---------- Handlers ---------- */
const withEpisode = fn => async el => { const e = store.byId.get(el.dataset.id); if (e) await fn(e, el); };
on('click', {
  'sheet-close': () => closeSheet(),
  'sheet-show': el => { closeSheet(); go('show/' + encodeURIComponent(el.dataset.id)); },
  'sheet-read': withEpisode(async e => { closeSheet(); if (player.id !== e.id) await load(e.id); go('play'); }),
  'sheet-chapter': withEpisode(async (e, el) => { await load(e.id, {play: true, at: Number(el.dataset.at)}); closeSheet(); }),
  'sheet-flag': withEpisode(async (e, el) => { await library.toggle(e.id, el.dataset.key); }),
  'sheet-download': withEpisode(e => enqueue(e.id, e.title, [{kind: 'download'}])),
  'sheet-undownload': withEpisode(async e => { if (await ask('Remove the download?', {detail: 'The episode, transcript and progress stay.', confirm: 'Remove', danger: true})) await library.removeDownload(e.id); }),
  'sheet-share': withEpisode(e => openShare(e.id)),
  'sheet-more': withEpisode(e => { moreFor = e.id; openSheet(renderMore); }),
  'sheet-bookmarks': withEpisode(e => { moreFor = e.id; openSheet(renderBookmarks); }),
  'bookmark-remove': el => removeBookmark(el.dataset.id, el.dataset.mark),
  'sheet-publisher': withEpisode(e => { enqueue(e.id, e.title, [{kind: 'publisher'}]); openEpisode(e.id); }),
  'sheet-import-transcript': withEpisode(async e => {
    const [file] = await pickFiles({accept: '.json,.srt,.vtt'});
    if (!file) return;
    if (e.doc && !await ask('Replace the transcript?', {detail: 'Its translation is replaced too.', confirm: 'Replace', danger: true})) return;
    await library.importTranscript(file, e.id); toast('Transcript added'); openEpisode(e.id);
  }),
  'sheet-attach': withEpisode(async e => {
    const [file] = await pickFiles({accept: 'audio/*,video/*,.mp3,.m4a,.m4b,.wav,.ogg,.opus,.flac,.mp4'});
    if (!file) return;
    if (e.audio && !await ask('Replace the attached audio?', {confirm: 'Replace'})) return;
    await library.attachAudio(e.id, file); toast('Audio attached'); openProcess(e.id, 'asr');
  }),
  'sheet-delete': withEpisode(async e => {
    if (!await ask('Delete this episode?', {detail: 'Removes its audio, transcript and progress from this browser.', confirm: 'Delete', danger: true})) return;
    closeSheet(); await library.removeEpisodes([e.id]); toast('Episode deleted');
  }),
  'flow-translate': () => { flow.translate = !flow.translate; refreshSheet(); },
  'flow-start': async () => {
    const e = store.byId.get(flow.id);
    if (!e) return;
    if (flow.kind === 'asr' && e.doc && !await ask('Replace the transcript?', {detail: 'The current transcript and translation are replaced.', confirm: 'Replace'})) return;
    enqueue(e.id, e.title, processSteps(e));
    openEpisode(e.id);
  },
  'job-cancel': el => cancel(el.dataset.id),
  'job-retry': el => retry(el.dataset.id),
  'job-dismiss': el => dismiss(el.dataset.id),
  'job-help': el => openAudioHelp(el.dataset.id),
  'relay-start': async () => {
    const e = store.byId.get(helpId);
    if (!e || relay) return;
    relay = {controller: new AbortController(), progress: null, message: 'Connecting'};
    refreshSheet();
    try {
      const audio = await fetchRelayAudio(e.audioUrl, {consent: true, signal: relay.controller.signal, maxMB: Number(library.settings().maxDownloadMB) || 100, onProgress: p => { relay.progress = p.progress; relay.message = `${(p.loaded / 1048576).toFixed(1)} MB`; refreshSheet(); }});
      await library.attachAudio(e.id, audio);
      relay = null; toast('Audio ready'); openProcess(e.id, 'asr');
    } catch (error) { const cancelled = relay?.controller.signal.aborted; relay = null; refreshSheet(); if (!cancelled) throw error; }
  },
  'relay-cancel': () => relay?.controller.abort(),
  'help-retry': () => { const e = store.byId.get(helpId); if (e) { closeSheet(); enqueue(e.id, e.title, [{kind: 'download', config: {retry: true}}]); } },
  'share-native': async () => { const e = store.byId.get(share.id); try { await navigator.share(episodeShare({...e, link: e.website}, player.id === e.id ? media.currentTime : e.position, share.withTime)); } catch (error) { if (error.name !== 'AbortError') throw error; } },
  'share-copy': async () => { await navigator.clipboard.writeText(document.querySelector('.share-preview').value); toast('Copied'); },
  'share-file': () => { const e = store.byId.get(share.id); const ext = (e.audio.type.split('/')[1] || 'bin').replace('mpeg', 'mp3').replace('x-', ''); downloadBlob(e.audio, e.audio.name || `${e.title.replace(/[\\/:*?"<>|]/g, '_')}.${ext}`); },
});
on('change', {
  'flow-source': el => { flow.source = el.value; refreshSheet(); },
  'flow-target': el => { flow.target = el.value; if (flow.kind === 'asr') flow.translate = true; refreshSheet(); },
  'flow-words': el => { flow.publisher = el.value === 'publisher'; refreshSheet(); },
  'flow-relay-consent': el => { flow.relayConsent = el.checked; refreshSheet(); },
  'flow-engine': el => { const kind = el.dataset.kind; flow.relayConsent = false; setProvider(kind, el.value === 'local' ? 'local' : prefs[`${kind}Hosted`] || (kind === 'asr' ? 'groq' : 'deepl')); refreshSheet(); },
  'flow-provider': el => { flow.relayConsent = false; setProvider(el.dataset.kind, el.value); savePrefs({[`${el.dataset.kind}Hosted`]: el.value}); refreshSheet(); },
  'share-time': el => { share.withTime = el.checked; refreshSheet(); },
});
on('input', {'flow-key': el => setKey(el.dataset.kind, el.value)});
on('submit', {
  'show-save': async form => {
    const v = new FormData(form), title = String(v.get('title')).trim();
    await library.saveFeed(showId, {titleOverride: title, title, tags: [...new Set(String(v.get('tags')).split(',').map(x => x.trim()).filter(Boolean))], speed: Number(v.get('speed')), skipIntro: Number(v.get('skipIntro')), skipOutro: Number(v.get('skipOutro')), newEpisodeAction: String(v.get('newEpisodeAction')), keepUpdated: v.has('keepUpdated'), autoDownload: v.has('autoDownload'), downloadInclude: String(v.get('downloadInclude')), downloadExclude: String(v.get('downloadExclude'))});
    closeSheet(); toast('Saved');
  },
});

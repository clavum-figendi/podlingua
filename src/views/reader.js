import {html, raw, esc, on, clock, downloadBlob, pickFiles} from '../ui/dom.js';
import {icon} from '../ui/icons.js';
import {cover, iconBtn, ring, empty, segmented, toggle as switchControl} from '../ui/parts.js';
import {openSheet, closeSheet, toast} from '../ui/feedback.js';
import {coverOf, showTitle} from '../services/store.js';
import {prefs, savePrefs, engineConfig, providerOf, languageName} from '../services/prefs.js';
import {activeJob, failedJob, jobLabel} from '../services/jobs.js';
import {player, media, current, seek, setRate, setSleep, sleepRemaining, markLoop, clearLoop, addBookmark, analyzeClarity, setClarity, next, pictureInPicture} from '../services/player.js';
import {activeSegments, tokenize, exportTranscript} from '../core.js';
import {lookup} from '../engines.js';
import * as library from '../services/library.js';

const ui = {search: false, q: '', follow: true, scrubbing: false, lookup: null, lookupConsent: false, chapters: null, chaptersFor: ''};
const unknown = lang => !lang || ['auto', 'unknown', 'und'].includes(lang);

/* ---------- Transcript markup (memoised; the expensive part) ---------- */
const words = (text, lang, side) => tokenize(text, lang).map(t => t.isWord ? `<span class="w" data-side="${side}">${esc(t.text)}</span>` : esc(t.text)).join('');
function sourceMarkup(s, lang) {
  if (!s.words?.length) return words(s.text, lang, 'src');
  let cursor = 0, out = '';
  for (const w of s.words) {
    const at = s.text.indexOf(w.text.trim(), cursor);
    if (at < 0) return words(s.text, lang, 'src');
    out += esc(s.text.slice(cursor, at)) + `<span class="w" data-side="src" data-s="${w.start}" data-e="${w.end}">${esc(w.text.trim())}</span>`;
    cursor = at + w.text.trim().length;
  }
  return out + esc(s.text.slice(cursor));
}
let memo = {key: '', markup: ''};
function transcriptMarkup(e) {
  const doc = e.doc, r = prefs.reader, q = ui.q.trim().toLocaleLowerCase();
  const key = [e.id, e.revision, r.layout, r.timestamps, r.speakers, q].join('|');
  if (memo.key === key) return {key, markup: memo.markup};
  const tr = doc.targetLanguage, provider = doc.translationProvider;
  const credit = provider === 'google' ? '<a class="credit" href="https://translate.google.com" target="_blank" rel="noopener"><img src="./credits/google-translate/color-regular.png" alt="powered by Google Translate" height="16"></a>' : '';
  const markup = doc.segments.map((s, i) => {
    if (q && !`${s.text} ${s.translation || ''} ${s.speaker || ''}`.toLocaleLowerCase().includes(q)) return '';
    return `<p class="seg" data-i="${i}">${r.timestamps ? `<button type="button" class="ts" data-act="seek" data-at="${s.start}" tabindex="-1">${clock(s.start)}</button>` : ''}`
      + `${r.speakers && s.speaker ? `<span class="spk">${esc(s.speaker)}</span>` : ''}`
      + `<span class="src" lang="${esc(doc.language)}" dir="auto">${sourceMarkup(s, doc.language)}</span>`
      + `${s.translation !== undefined ? `<span class="tr" lang="${esc(tr)}" dir="auto">${words(s.translation, tr, 'tr')}</span>` : ''}</p>`;
  }).join('') || `<p class="muted center">Nothing matches “${esc(ui.q)}”.</p>`;
  memo = {key, markup: markup + credit};
  return {key, markup: memo.markup};
}

/* ---------- View ---------- */
function noTranscript(e) {
  const job = activeJob(e.id), failed = failedJob(e.id);
  if (job) return html`<div class="read-empty">${ring(job.status === 'running' ? job.progress : null)}<h2>${jobLabel(job)}…</h2><p class="muted">${job.message || 'You can keep listening meanwhile.'}</p><button type="button" class="btn ghost" data-act="job-cancel" data-id="${e.id}">Cancel</button></div>`;
  return html`<div class="read-empty">
    <span class="read-empty-art" aria-hidden="true">${icon('quote')}</span>
    <h2>Read along</h2>
    ${failed ? html`<p class="hint warn">${icon('alert')}${failed.error}</p>` : ''}
    <div class="action-col">
      <button type="button" class="btn primary big" data-act="process" data-id="${e.id}" data-kind="asr">${icon('wave')}Create transcript</button>
      <button type="button" class="btn ghost" data-act="reader-import" data-id="${e.id}">${icon('file')}Import transcript file</button>
    </div>
  </div>`;
}

function langBar(e) {
  const doc = e.doc, job = activeJob(e.id);
  return html`<div class="lang-bar">
    <span class="lang-chip">${icon('wave')}${unknown(doc.language) ? 'Original' : languageName(doc.language)}</span>
    ${doc.targetLanguage ? html`<span class="lang-chip is-tr">${icon('translate')}${languageName(doc.targetLanguage)}</span>`
      : job?.kind === 'translate' ? html`<span class="lang-chip">${ring(job.progress)}${jobLabel(job)}</span>`
        : html`<button type="button" class="btn small" data-act="process" data-id="${e.id}" data-kind="translate">${icon('translate')}Translate</button>`}
    <span class="grow"></span>
    ${ui.search ? html`<label class="filter-field">${icon('search')}<input id="reader-q" type="search" value="${ui.q}" placeholder="Find in transcript" data-input="reader-q" aria-label="Find in transcript"></label>` : ''}
  </div>`;
}

function chapterTicks(e) {
  const d = media.duration;
  if (!Number.isFinite(d) || !e.chapters?.length) return '';
  return html`${e.chapters.map(c => html`<i class="tick" style="left:${(c.start / d * 100).toFixed(2)}%"></i>`)}`;
}
function loopBand() {
  const {a, b} = player.loop, d = media.duration;
  if (a === null || !Number.isFinite(d)) return '';
  return html`<i class="loop-band" style="left:${(a / d * 100).toFixed(2)}%;width:${(((b ?? a) - a) / d * 100).toFixed(2)}%"></i>`;
}

function transport(e) {
  const sleeping = player.sleep.deadline ? clock(sleepRemaining() / 1000) : player.sleep.end ? 'End' : '';
  return html`<footer class="transport">
    <div class="scrub">
      <span class="time" id="t-now">${clock(media.currentTime)}</span>
      <div class="scrub-track">${chapterTicks(e)}${loopBand()}<input id="scrubber" type="range" min="0" max="${Number.isFinite(media.duration) ? media.duration : 0}" step="0.1" value="${media.currentTime}" data-input="scrub" aria-label="Position"></div>
      <span class="time" id="t-left">-${clock((media.duration || 0) - media.currentTime)}</span>
    </div>
    <div class="controls">
      <button type="button" class="chip" data-act="reader-speed" aria-label="Playback speed">${player.rate}×</button>
      <button type="button" class="icon-btn big" data-act="skip" data-dir="-1" aria-label="Skip back">${icon('back')}</button>
      <button type="button" class="play-btn big" data-act="toggle" aria-label="${media.paused ? 'Play' : 'Pause'}" ${e.audio || e.audioUrl ? '' : 'disabled'}>${icon(media.paused ? 'play' : 'pause')}</button>
      <button type="button" class="icon-btn big" data-act="skip" data-dir="1" aria-label="Skip forward">${icon('forward')}</button>
      <button type="button" class="chip ${sleeping ? 'on' : ''}" data-act="reader-sleep" aria-label="Sleep timer">${icon('timer')}${sleeping}</button>
    </div>
    <div class="controls secondary">
      ${iconBtn('bookmark', 'Bookmark this moment', 'reader-bookmark')}
      ${iconBtn('loop', player.loop.b !== null ? 'Clear loop' : player.loop.a !== null ? 'Set loop end' : 'Loop a passage', player.loop.b !== null ? 'reader-loop-clear' : 'reader-loop', {}, player.loop.a !== null ? 'on' : '')}
      ${iconBtn('volume', 'Clarity', 'reader-clarity', {}, player.clarity.skip || player.clarity.level ? 'on' : '')}
      ${iconBtn('chapters', 'Chapters', 'reader-chapters')}
      ${player.hasVideo ? html`${iconBtn('pip', 'Picture in picture', 'reader-pip')}${iconBtn('expand', 'Full screen', 'reader-fullscreen')}` : ''}
      ${iconBtn('next', 'Next in queue', 'reader-next')}
    </div>
  </footer>`;
}

function render() {
  const e = current();
  if (!e) return html`<div class="page">${empty('headphones', 'Nothing playing.', html`<a class="btn primary" href="#/library/new">${icon('library')}Open library</a>`)}</div>`;
  const t = markupOrEmpty(e);
  return html`<div class="reader layout-${prefs.reader.layout}" style="--reader-size:${prefs.reader.size}px">
    <header class="reader-top">
      ${iconBtn('down', 'Close player', 'back', {}, 'reader-close')}
      <button type="button" class="reader-title" data-act="episode" data-id="${e.id}"><span class="kicker">${showTitle(e)}</span><span>${e.title}</span></button>
      ${e.doc ? iconBtn('search', 'Find', 'reader-search', {}, ui.search ? 'on' : '') : ''}
      ${e.doc ? iconBtn('text', 'Reading options', 'reader-options') : ''}
      ${iconBtn('more', 'More', 'reader-more')}
    </header>
    <div class="reader-grid">
      <aside class="reader-side">
        <div class="art ${player.hasVideo ? 'video-slot' : ''}">${player.hasVideo ? '' : cover(coverOf(e), showTitle(e) || e.title, 'hero')}</div>
        ${player.error ? html`<p class="hint warn">${icon('alert')}${player.error}${e.audioUrl && !e.audio ? html` <button type="button" class="link" data-act="sheet-download" data-id="${e.id}">Download</button>` : ''}</p>` : ''}
        ${transport(e)}
      </aside>
      <section class="read-pane ${e.doc ? '' : 'empty-pane'}">
        ${e.doc ? langBar(e) : ''}
        ${t}
        ${e.doc && !ui.follow ? html`<button type="button" class="follow-pill" data-act="reader-follow">${icon('down')}Back to now</button>` : ''}
        ${ui.lookup ? lookupBubble() : ''}
      </section>
    </div>
  </div>`;
}
function markupOrEmpty(e) {
  if (!e.doc) return noTranscript(e);
  const {key, markup} = transcriptMarkup(e);
  return html`<div id="transcript" class="transcript" data-sig="${key}" tabindex="0">${raw(markup)}</div>`;
}

/* ---------- Live sync (no re-render on time updates) ---------- */
let lastSeg = -1;
function tick(m) {
  const scrub = document.querySelector('#scrubber');
  if (!scrub) return;
  if (!ui.scrubbing) { if (Number.isFinite(m.duration)) scrub.max = m.duration; scrub.value = m.currentTime; }
  document.querySelector('#t-now').textContent = clock(m.currentTime);
  document.querySelector('#t-left').textContent = '-' + clock((m.duration || 0) - m.currentTime);
  const doc = current()?.doc, box = document.querySelector('#transcript');
  if (!doc || !box) return;
  const t = m.currentTime, active = activeSegments(doc, t);
  for (const el of box.querySelectorAll('.seg.on')) if (!active.includes(Number(el.dataset.i))) { el.classList.remove('on'); for (const w of el.querySelectorAll('.heard,.now')) w.classList.remove('heard', 'now'); }
  for (const i of active) box.querySelector(`.seg[data-i="${i}"]`)?.classList.add('on');
  const i = active.at(-1) ?? -1, el = i >= 0 && box.querySelector(`.seg[data-i="${i}"]`);
  if (!el) return;
  // Highlighter: words fill in as they are heard — exact with word timings, proportional otherwise.
  const s = doc.segments[i], wordEls = el.querySelectorAll(prefs.reader.layout === 'target' ? '.tr .w' : '.src .w'), timed = el.querySelectorAll('.src .w[data-s]');
  let heard = Math.ceil((s.end > s.start ? (t - s.start) / (s.end - s.start) : 1) * wordEls.length);
  if (timed.length && prefs.reader.layout !== 'target') {
    heard = 0;
    for (const w of timed) { const start = Number(w.dataset.s); w.classList.toggle('now', t >= start && t < Number(w.dataset.e)); if (t >= start) heard++; }
  }
  wordEls.forEach((w, n) => w.classList.toggle('heard', n < heard));
  if (i !== lastSeg) {
    lastSeg = i;
    if (ui.follow && prefs.reader.follow) el.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  }
}

function stopFollowing() {
  if (!ui.follow) return;
  ui.follow = false;
  window.dispatchEvent(new Event('podlingua:render'));
}
for (const type of ['wheel', 'touchmove']) document.addEventListener(type, e => { if (e.target.closest?.('#transcript')) stopFollowing(); }, {passive: true});

/* ---------- Word lookup ---------- */
function lookupBubble() {
  const l = ui.lookup, p = providerOf('translation');
  const needsConsent = !ui.lookupConsent;
  return html`<div class="bubble" style="top:${l.top}px;left:${l.left}px" role="dialog" aria-label="Look up ${l.word}">
    <div class="bubble-head"><strong lang="${l.source}">${l.word}</strong>${iconBtn('close', 'Close', 'lookup-close')}</div>
    <p class="muted small">${languageName(l.source)} → ${languageName(l.target)}</p>
    ${needsConsent ? html`<p class="small">${p.id === 'local' ? 'Uses the on-device translator (model downloads once).' : `Sends the word to ${p.name}.`}</p><button type="button" class="btn primary small" data-act="lookup-allow">${icon('translate')}Translate</button>`
      : l.result === null ? html`<p>${ring(null)}</p>` : html`<p class="bubble-result" lang="${l.target}">${l.result}</p>${p.id === 'google' ? html`<small>Google Translate</small>` : ''}`}
    ${l.at !== null ? html`<button type="button" class="btn ghost small" data-act="seek" data-at="${l.at}">${icon('play')}Play from here</button>` : ''}
    <small class="fineprint">Machine translation, not a dictionary.</small>
  </div>`;
}
let lookupController = null;
async function runLookup() {
  const l = ui.lookup;
  if (!l || !ui.lookupConsent) return;
  lookupController?.abort();
  lookupController = new AbortController();
  const signal = lookupController.signal;
  try {
    const config = engineConfig('translation', {source: l.source, target: l.target, allowDownload: true, allowCloud: providerOf('translation').id !== 'local'});
    const value = await lookup(l.word, l.source, l.target, config, {signal});
    if (ui.lookup === l) l.result = value;
  } catch (error) { if (ui.lookup === l && !signal.aborted) l.result = error.message; }
  window.dispatchEvent(new Event('podlingua:render'));
}
document.addEventListener('click', e => {
  const w = e.target.closest?.('#transcript .w');
  if (!w) { if (ui.lookup && !e.target.closest('.bubble')) { ui.lookup = null; lookupController?.abort(); window.dispatchEvent(new Event('podlingua:render')); } return; }
  const doc = current()?.doc, seg = w.closest('.seg'), pane = document.querySelector('.read-pane');
  if (!doc || !pane) return;
  const s = doc.segments[Number(seg.dataset.i)], fromSource = w.dataset.side === 'src';
  const source = fromSource ? (unknown(doc.language) ? prefs.source : doc.language) : doc.targetLanguage;
  const target = fromSource ? doc.targetLanguage || prefs.target : (unknown(doc.language) ? prefs.source : doc.language);
  const rect = w.getBoundingClientRect(), box = pane.getBoundingClientRect();
  ui.lookup = {word: w.textContent.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || w.textContent, source, target, result: null, at: w.dataset.s ? Number(w.dataset.s) : s.start,
    top: rect.bottom - box.top + pane.scrollTop + 8, left: Math.max(8, Math.min(box.width - 280, rect.left - box.left - 20))};
  window.dispatchEvent(new Event('podlingua:render'));
  runLookup();
});

/* ---------- Small sheets ---------- */
const closeBtn = html`<button type="button" class="icon-btn sheet-close" data-act="sheet-close" aria-label="Close">${icon('close')}</button>`;
const SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const speedSheet = () => html`${closeBtn}<h2 class="sheet-title">${icon('speed')}Speed</h2><div class="chips wrap">${SPEEDS.map(s => html`<button type="button" class="chip ${player.rate === s ? 'on' : ''}" data-act="set-speed" data-v="${s}">${s}×</button>`)}</div><p class="fineprint">Saved for this show.</p>`;
const sleepSheet = () => html`${closeBtn}<h2 class="sheet-title">${icon('timer')}Sleep timer</h2><div class="chips wrap">${[5, 10, 15, 30, 45, 60].map(m => html`<button type="button" class="chip" data-act="set-sleep" data-v="${m}">${m} min</button>`)}<button type="button" class="chip ${player.sleep.end ? 'on' : ''}" data-act="set-sleep" data-v="end">End of episode</button>${player.sleep.deadline || player.sleep.end ? html`<button type="button" class="chip" data-act="set-sleep" data-v="0">${icon('close')}Off</button>` : ''}</div>`;
const optionsSheet = () => {
  const r = prefs.reader;
  return html`${closeBtn}<h2 class="sheet-title">${icon('text')}Reading</h2>
    ${segmented('reader-layout', r.layout, [['stacked', 'Stacked', 'rows'], ['columns', 'Side by side', 'columns'], ['source', 'Original', 'wave'], ['target', 'Translation', 'translate']])}
    <label class="range-row">${icon('text')}<span class="sr">Text size</span><input type="range" min="15" max="32" step="1" value="${r.size}" data-input="reader-size" aria-label="Text size"><span>${r.size}</span></label>
    ${switchControl('reader-follow-pref', r.follow, 'Follow the audio')}
    ${switchControl('reader-timestamps', r.timestamps, 'Timestamps')}
    ${switchControl('reader-speakers', r.speakers, 'Speakers')}`;
};
const claritySheet = () => {
  const c = player.clarity;
  return html`${closeBtn}<h2 class="sheet-title">${icon('volume')}Clarity</h2>
    ${c.status === 'ready' ? html`${switchControl('clarity-skip', c.skip, 'Skip silences', `${c.ranges.length} found`)}${switchControl('clarity-level', c.level, 'Boost quiet speech', `Up to ${c.gain.toFixed(1)}×`)}`
      : html`<p class="muted">Analyzes the saved audio on this device. The original file is never changed.</p><button type="button" class="btn primary wide" data-act="clarity-analyze" ${c.status === 'analyzing' ? 'disabled' : ''}>${c.status === 'analyzing' ? ring(null) : icon('zap')}Analyze</button>`}`;
};
const chaptersSheet = () => html`${closeBtn}<h2 class="sheet-title">${icon('chapters')}Chapters</h2>
  ${ui.chapters === null ? html`<p>${ring(null)}</p>` : ui.chapters.length ? html`<ol class="chapter-list">${ui.chapters.map(c => html`<li><button type="button" class="link" data-act="seek" data-at="${c.start}" data-close="1"><span>${clock(c.start)}</span>${c.title || 'Chapter'}</button></li>`)}</ol>` : html`<p class="muted">No chapters for this episode.</p>`}`;
const moreSheet = () => {
  const e = current();
  return html`${closeBtn}<h2 class="sheet-title">${e.title}</h2><div class="menu">
    <button type="button" data-act="episode" data-id="${e.id}">${icon('info')}Episode details</button>
    <button type="button" data-act="sheet-share" data-id="${e.id}">${icon('share')}Share</button>
    ${e.doc ? html`<button type="button" data-act="process" data-id="${e.id}" data-kind="translate">${icon('translate')}${e.doc.targetLanguage ? 'Translate again' : 'Translate'}</button>
      <button type="button" data-act="process" data-id="${e.id}" data-kind="asr">${icon('wave')}Transcribe again</button>
      ${['json', 'srt', 'vtt', 'text'].map(f => html`<button type="button" data-act="reader-export" data-format="${f}">${icon('download')}Export ${f === 'text' ? 'text' : f.toUpperCase()}</button>`)}` : ''}
    <button type="button" data-act="reader-import" data-id="${e.id}">${icon('file')}Import transcript file</button>
    <button type="button" data-act="sheet-bookmarks" data-id="${e.id}">${icon('bookmark')}Bookmarks</button>
  </div>`;
};

on('click', {
  seek(el) { seek(Number(el.dataset.at)); if (media.paused && media.currentSrc) media.play().catch(() => {}); ui.follow = true; lastSeg = -1; if (el.dataset.close) closeSheet(); },
  'reader-search': () => { ui.search = !ui.search; if (!ui.search) ui.q = ''; window.dispatchEvent(new Event('podlingua:render')); requestAnimationFrame(() => document.querySelector('#reader-q')?.focus()); },
  'reader-follow': () => { ui.follow = true; lastSeg = -1; window.dispatchEvent(new Event('podlingua:render')); tick(media); },
  'reader-options': () => openSheet(optionsSheet),
  'reader-more': () => openSheet(moreSheet),
  'reader-speed': () => openSheet(speedSheet),
  'reader-sleep': () => openSheet(sleepSheet),
  'reader-clarity': () => openSheet(claritySheet),
  async 'reader-chapters'() { const e = current(); if (ui.chaptersFor !== e.id) { ui.chapters = null; ui.chaptersFor = e.id; } openSheet(chaptersSheet); try { ui.chapters = await library.loadChapters(e.id); } catch (error) { ui.chapters = []; throw error; } finally { window.dispatchEvent(new Event('podlingua:render')); } },
  'set-speed': el => { setRate(Number(el.dataset.v)); closeSheet(); },
  'set-sleep': el => { setSleep(el.dataset.v === 'end' ? 'end' : Number(el.dataset.v)); closeSheet(); },
  async 'reader-bookmark'() { const at = await addBookmark(); toast(`Bookmarked ${clock(at)}`); },
  'reader-loop': () => { markLoop(); toast(player.loop.b !== null ? `Looping ${clock(player.loop.a)}–${clock(player.loop.b)}` : 'Loop start set. Tap again at the end.'); },
  'reader-loop-clear': () => clearLoop(),
  'clarity-analyze': () => analyzeClarity(),
  'reader-pip': () => pictureInPicture(),
  'reader-fullscreen': () => media.requestFullscreen(),
  async 'reader-next'() { if (!await next()) toast('Queue is empty'); },
  'reader-export': el => { const e = current(), f = el.dataset.format; downloadBlob(new Blob([exportTranscript(e.doc, f)], {type: f === 'json' ? 'application/json' : 'text/plain;charset=utf-8'}), `${e.title}.${f === 'text' ? 'txt' : f}`); closeSheet(); },
  async 'reader-import'(el) { const [file] = await pickFiles({accept: '.json,.srt,.vtt'}); if (!file) return; await library.importTranscript(file, el.dataset.id); closeSheet(); toast('Transcript added'); },
  'lookup-close': () => { ui.lookup = null; lookupController?.abort(); window.dispatchEvent(new Event('podlingua:render')); },
  'lookup-allow': () => { ui.lookupConsent = true; window.dispatchEvent(new Event('podlingua:render')); runLookup(); },
});
on('input', {
  scrub: el => { ui.scrubbing = true; seek(Number(el.value)); clearTimeout(ui.scrubTimer); ui.scrubTimer = setTimeout(() => { ui.scrubbing = false; }, 300); },
  'reader-q': el => { ui.q = el.value; window.dispatchEvent(new Event('podlingua:render')); },
  'reader-size': el => savePrefs({reader: {size: Number(el.value)}}),
});
on('change', {
  'reader-layout': el => savePrefs({reader: {layout: el.value}}),
  'reader-follow-pref': el => savePrefs({reader: {follow: el.checked}}),
  'reader-timestamps': el => savePrefs({reader: {timestamps: el.checked}}),
  'reader-speakers': el => savePrefs({reader: {speakers: el.checked}}),
  'clarity-skip': el => setClarity({skip: el.checked}),
  'clarity-level': el => setClarity({level: el.checked}),
});

export default {
  render, tick, title: () => current()?.title || 'Player',
  mounted() { tick(media); },
  enter() { ui.follow = true; lastSeg = -1; },
  leave() { ui.lookup = null; lookupController?.abort(); },
};

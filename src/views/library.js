import {html, on, go, pickFiles, downloadBlob} from '../ui/dom.js';
import {icon} from '../ui/icons.js';
import {episodeRow, feedTile, empty, iconBtn} from '../ui/parts.js';
import {toast, ask, openSheet, closeSheet} from '../ui/feedback.js';
import {store, visible} from '../services/store.js';
import * as library from '../services/library.js';
import {enqueue} from '../services/jobs.js';
import {engineConfig, providerOf, prefs, languageName} from '../services/prefs.js';
import {load} from '../services/player.js';
import {needsDeepLRelay} from '../engines.js';

const TABS = [
  ['shows', 'library', 'Shows'], ['new', 'inbox', 'New'], ['queue', 'queue', 'Queue'], ['saved', 'saved', 'Saved'],
  ['favorites', 'heart', 'Loved'], ['history', 'history', 'History'], ['files', 'folder', 'Files'], ['all', 'rows', 'All'],
];
const PAGE = 40;
const ui = {tab: 'shows', q: '', sort: 'newest', hidePlayed: false, selecting: false, selected: new Set(), limit: PAGE};

const byDate = (a, b) => (b.published || b.createdAt || 0) - (a.published || a.createdAt || 0);
const sorters = {newest: byDate, oldest: (a, b) => -byDate(a, b), title: (a, b) => String(a.title).localeCompare(String(b.title)), duration: (a, b) => (a.duration || 0) - (b.duration || 0)};

function episodesFor(tab) {
  let list;
  if (tab === 'queue') list = store.state.queue.map(id => store.byId.get(id)).filter(Boolean);
  else {
    list = store.episodes.filter({
      new: e => e.feedId && !e.played && !e.archived, saved: e => e.audio, favorites: e => e.favorite,
      history: e => e.playedAt || Number(e.position) > 0, files: e => !e.feedId, all: () => true,
    }[tab]);
    list.sort(tab === 'history' ? (a, b) => (Number(b.playedAt) || 0) - (Number(a.playedAt) || 0) : sorters[ui.sort]);
  }
  const q = ui.q.trim().toLocaleLowerCase();
  return list.filter(e => visible(e) && (!ui.hidePlayed || !e.played || tab === 'history') && (!q || `${e.title} ${store.feedById.get(e.feedId)?.title || ''}`.toLocaleLowerCase().includes(q)));
}

function toolbar(count) {
  if (ui.selecting) return html`<div class="toolbar selecting">
    <label class="check"><input type="checkbox" data-change="select-all" ${count && ui.selected.size === Math.min(count, ui.limit) ? 'checked' : ''}>${ui.selected.size} selected</label>
    <span class="grow"></span>
    ${[['queue', 'queue', 'Queue'], ['download', 'download', 'Download'], ['played', 'played', 'Mark played'], ['unplayed', 'eye', 'Mark unplayed'], ['favorite', 'heart', 'Love'], ['archive', 'archive', 'Archive'], ['transcribe', 'transcript', 'Transcribe'], ['delete', 'trash', 'Delete']].map(([op, glyph, label]) => html`<button type="button" class="icon-btn" data-act="bulk" data-op="${op}" title="${label}" aria-label="${label}" ${ui.selected.size ? '' : 'disabled'}>${icon(glyph)}</button>`)}
    ${iconBtn('close', 'Done selecting', 'select-mode')}
  </div>`;
  return html`<div class="toolbar">
    <label class="filter-field">${icon('search')}<input type="search" placeholder="Filter" value="${ui.q}" data-input="lib-q" aria-label="Filter episodes"></label>
    ${ui.tab !== 'queue' && ui.tab !== 'history' ? html`<label class="select-icon" title="Sort">${icon('sort')}<select data-change="lib-sort" aria-label="Sort">${[['newest', 'Newest'], ['oldest', 'Oldest'], ['title', 'Title'], ['duration', 'Shortest']].map(([v, t]) => html`<option value="${v}" ${ui.sort === v ? 'selected' : ''}>${t}</option>`)}</select></label>` : ''}
    ${ui.tab !== 'new' && ui.tab !== 'history' ? iconBtn('eye', ui.hidePlayed ? 'Show played' : 'Hide played', 'lib-hide-played', {}, ui.hidePlayed ? 'on' : '') : ''}
    ${ui.tab === 'queue' ? html`${iconBtn('play', 'Play queue', 'queue-play')}${iconBtn('shuffle', 'Shuffle', 'queue-shuffle')}${iconBtn('trash', 'Clear queue', 'queue-clear')}` : ''}
    ${ui.tab === 'files' ? html`${iconBtn('upload', 'Add audio', 'import-audio')}${iconBtn('file', 'Import transcript', 'import-transcript')}` : ''}
    ${iconBtn('select', 'Select', 'select-mode')}
  </div>`;
}

function render(tab = ui.tab) {
  if (!TABS.some(([id]) => id === tab)) tab = 'shows';
  if (tab !== ui.tab) Object.assign(ui, {tab, selecting: false, limit: PAGE, q: ''}), ui.selected.clear();
  const tabBar = html`<nav class="tabs" aria-label="Library sections">${TABS.map(([id, glyph, label]) => html`<a href="#/library/${id}" class="tab ${tab === id ? 'on' : ''}" ${tab === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}${id === 'queue' && store.state.queue.length ? html` <b>${store.state.queue.length}</b>` : ''}</span></a>`)}</nav>`;
  const head = html`<header class="page-head"><h1>Library</h1><div class="head-tools">${iconBtn('stats', 'Listening stats', 'go', {to: 'stats'})}${iconBtn('more', 'Library tools', 'lib-tools')}</div></header>`;
  if (tab === 'shows') {
    const feeds = [...store.feedById.values()];
    return html`<div class="page">${head}${tabBar}
      <div class="toolbar"><span class="grow muted">${feeds.length} shows</span>${iconBtn('refresh', 'Refresh all', 'refresh-all')}${iconBtn('plus', 'Add show', 'go', {to: 'discover'})}</div>
      ${feeds.length ? html`<div class="grid-tiles">${feeds.map(f => feedTile(f))}</div>` : empty('library', 'No shows yet.', html`<a class="btn primary" href="#/discover">${icon('search')}Find a podcast</a>`)}
    </div>`;
  }
  const list = episodesFor(tab), page = list.slice(0, ui.limit);
  return html`<div class="page">${head}${tabBar}${toolbar(list.length)}
    ${page.length ? html`<div class="list-eps">${page.map(e => episodeRow(e, {selecting: ui.selecting, selected: ui.selected.has(e.id), queueControls: tab === 'queue' && !ui.selecting, showFeed: tab !== 'files'}))}</div>
      ${list.length > ui.limit ? html`<button type="button" class="btn ghost wide" data-act="lib-more">${icon('down')}Show more (${list.length - ui.limit})</button>` : ''}`
    : empty(TABS.find(([id]) => id === tab)[1], ui.q ? 'Nothing matches.' : {queue: 'Your queue is empty. Tap + on any episode.', new: 'All caught up.', saved: 'Downloaded episodes appear here.', favorites: 'Tap ♡ on an episode to keep it here.', history: 'Episodes you play appear here.', files: 'Add your own audio or video files.', all: 'No episodes yet.'}[tab],
      tab === 'files' ? html`<button type="button" class="btn primary" data-act="import-audio">${icon('upload')}Add audio</button>` : '')}
  </div>`;
}

function renderTools() {
  return html`<button type="button" class="icon-btn sheet-close" data-act="sheet-close" aria-label="Close">${icon('close')}</button>
    <h2 class="sheet-title">${icon('library')}Library tools</h2>
    <div class="menu">
      <button type="button" data-act="import-audio">${icon('upload')}Add audio files</button>
      <button type="button" data-act="import-folder">${icon('folder')}Add a folder</button>
      <button type="button" data-act="import-transcript">${icon('file')}Import transcript (JSON, SRT, VTT)</button>
      <button type="button" data-act="batch-transcribe">${icon('transcript')}Transcribe all saved episodes</button>
      <button type="button" data-act="batch-translate">${icon('translate')}Translate all transcripts to ${languageName(prefs.target)}</button>
      <button type="button" data-act="opml-import">${icon('rss')}Import subscriptions (OPML)</button>
      <button type="button" data-act="opml-export">${icon('download')}Export subscriptions (OPML)</button>
    </div>`;
}

async function batch(kind) {
  const ids = store.episodes.filter(e => kind === 'asr' ? e.audio && !e.doc : e.doc && e.doc.targetLanguage !== prefs.target).map(e => e.id);
  if (!ids.length) return toast(kind === 'asr' ? 'Every saved episode has a transcript.' : 'Every transcript is already translated.');
  const p = providerOf(kind === 'asr' ? 'asr' : 'translation');
  const relayRequired = kind !== 'asr' && p.id === 'deepl' && needsDeepLRelay(prefs.translation.endpoint);
  if (!await ask(`${kind === 'asr' ? 'Transcribe' : 'Translate'} ${ids.length} episodes?`, {detail: relayRequired ? "Sends transcript text and your DeepL API key through Podlingua's Cloudflare relay to DeepL for these episodes. The relay does not store them. Your API allowance applies; no automatic retry or provider switch." : p.id === 'local' ? 'Runs on this device. Models download from Hugging Face the first time. Keep this tab open.' : `Sends ${kind === 'asr' ? 'audio' : 'text'} to ${p.name}. Charges may apply.`, confirm: 'Start'})) return;
  closeSheet();
  for (const id of ids) {
    const e = store.byId.get(id), source = e.doc?.language && !['auto', 'unknown'].includes(e.doc.language) ? e.doc.language : prefs.source;
    enqueue(id, e.title, [{kind: kind === 'asr' ? 'asr' : 'translate', config: engineConfig(kind === 'asr' ? 'asr' : 'translation', {source, allowDownload: true, allowTranslationRelay: relayRequired, allowCloud: p.id !== 'local'})}]);
  }
}

async function importFiles(files) {
  if (!files.length) return;
  const result = await library.importAudio(files);
  toast(`${result.imported.length} added${result.skipped.length ? `, ${result.skipped.length} already here` : ''}${result.errors.length ? `, ${result.errors.length} failed` : ''}`, {error: !result.imported.length && !!result.errors.length});
}

on('click', {
  'lib-tools': () => openSheet(renderTools),
  'lib-more': () => { ui.limit += PAGE * 2; window.dispatchEvent(new Event('podlingua:render')); },
  'lib-hide-played': () => { ui.hidePlayed = !ui.hidePlayed; window.dispatchEvent(new Event('podlingua:render')); },
  'select-mode': () => { ui.selecting = !ui.selecting; ui.selected.clear(); window.dispatchEvent(new Event('podlingua:render')); },
  'refresh-all': async () => { toast('Refreshing shows…'); const failures = await library.refreshAll(); toast(failures.length ? `${failures.length} shows failed: ${failures[0]}` : 'All shows refreshed', {error: !!failures.length}); },
  'queue-play': async () => { const first = episodesFor('queue').find(e => !e.played) || episodesFor('queue')[0]; if (first) await load(first.id, {play: true}); },
  'queue-shuffle': () => library.queue('shuffle'),
  'queue-clear': async () => { if (await ask('Clear the queue?', {detail: 'Episodes stay in your library.', confirm: 'Clear', danger: true})) await library.queue('clear'); },
  'import-audio': async () => importFiles(await pickFiles({accept: 'audio/*,video/*,.mp3,.m4a,.m4b,.ogg,.opus,.wav,.flac', multiple: true})),
  'import-folder': async () => importFiles(await pickFiles({multiple: true, directory: true})),
  'import-transcript': async () => { const [file] = await pickFiles({accept: '.json,.srt,.vtt'}); if (!file) return; const saved = await library.importTranscript(file); closeSheet(); toast('Transcript imported'); await load(saved.id); go('play'); },
  'batch-transcribe': () => batch('asr'),
  'batch-translate': () => batch('translation'),
  'opml-import': async () => { const [file] = await pickFiles({accept: '.opml,.xml'}); if (!file) return; closeSheet(); toast('Importing subscriptions…'); const {count, errors} = await library.importOPML(file); toast(`${count} shows added${errors.length ? `, ${errors.length} failed` : ''}`, {error: !!errors.length && !count}); },
  'opml-export': () => downloadBlob(library.opmlBlob(), 'podlingua-subscriptions.opml'),
  async bulk(el) {
    const ids = [...ui.selected], op = el.dataset.op;
    if (op === 'download') ids.forEach(id => { const e = store.byId.get(id); if (e.audioUrl && !e.audio) enqueue(id, e.title, [{kind: 'download'}]); });
    else if (op === 'transcribe') { ids.forEach(id => { const e = store.byId.get(id); enqueue(id, e.title, [...(e.audio ? [] : [{kind: 'download'}]), {kind: 'asr', config: engineConfig('asr', {allowDownload: true, allowCloud: providerOf('asr').id !== 'local'})}]); }); }
    else {
      if (op === 'delete' && !await ask(`Delete ${ids.length} episodes?`, {detail: 'Audio, transcripts and progress are removed from this browser.', confirm: 'Delete', danger: true})) return;
      await (op === 'delete' ? library.removeEpisodes(ids) : library.bulk(ids, op));
    }
    ui.selected.clear(); ui.selecting = false; toast('Done');
    window.dispatchEvent(new Event('podlingua:render'));
  },
});
on('input', {'lib-q': el => { ui.q = el.value; ui.limit = PAGE; window.dispatchEvent(new Event('podlingua:render')); }});
on('change', {
  'lib-sort': el => { ui.sort = el.value; window.dispatchEvent(new Event('podlingua:render')); },
  select: el => { el.checked ? ui.selected.add(el.dataset.id) : ui.selected.delete(el.dataset.id); window.dispatchEvent(new Event('podlingua:render')); },
  'select-all': el => { for (const e of episodesFor(ui.tab).slice(0, ui.limit)) el.checked ? ui.selected.add(e.id) : ui.selected.delete(e.id); window.dispatchEvent(new Event('podlingua:render')); },
});

export default {render, title: () => 'Library'};

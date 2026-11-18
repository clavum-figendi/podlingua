import {html, on, go, shortDate, duration} from '../ui/dom.js';
import {icon} from '../ui/icons.js';
import {cover, iconBtn, empty} from '../ui/parts.js';
import {toast} from '../ui/feedback.js';
import {store} from '../services/store.js';
import * as library from '../services/library.js';
import {load} from '../services/player.js';
import {showHeader} from './show.js';

/** Look inside a directory result before following it. Nothing is stored until you play or follow. */
const state = {url: '', feed: null, error: '', loading: false, serial: 0};
const rerender = () => window.dispatchEvent(new Event('podlingua:render'));

async function fetchPreview(url) {
  const serial = ++state.serial;
  Object.assign(state, {url, feed: null, error: '', loading: true});
  try { const feed = await library.previewFeed(url); if (serial === state.serial) state.feed = feed; }
  catch (error) { if (serial === state.serial) state.error = error.message; }
  finally { if (serial === state.serial) { state.loading = false; rerender(); } }
}

function render(url) {
  if (store.feedById.has(url)) { queueMicrotask(() => go('show/' + encodeURIComponent(url))); return ''; }
  const back = html`<div class="crumbs">${iconBtn('left', 'Back', 'back')}</div>`;
  if (state.loading || state.url !== url) return html`<div class="page">${back}<div class="loading" aria-busy="true"></div></div>`;
  if (state.error) return html`<div class="page">${back}<div class="callout error">${icon('alert')}<span class="grow">${state.error}</span><button type="button" class="btn small" data-act="preview-retry">${icon('refresh')}Retry</button></div></div>`;
  const f = state.feed;
  return html`<div class="page">${back}
    ${showHeader(f, html`<button type="button" class="btn primary" data-act="subscribe" data-url="${url}">${icon('plus')}Follow</button>`)}
    ${f.episodes.length ? html`<div class="list-eps">${f.episodes.slice(0, 60).map((e, i) => html`<article class="ep" data-key="${e.id}">
      <button type="button" class="ep-play" data-act="preview-play" data-index="${i}" aria-label="Play ${e.title}">${cover(e.image || f.image, f.title, 'sm')}<span class="ep-play-glyph">${icon('play')}</span></button>
      <div class="ep-main static"><span class="ep-kicker"><span>${shortDate(e.published)}</span></span><span class="ep-title">${e.title}</span><span class="ep-meta">${duration(e.duration)}</span></div>
    </article>`)}</div>` : empty('rss', 'No episodes in this feed.')}
  </div>`;
}

on('click', {
  'preview-retry': () => fetchPreview(state.url),
  async 'preview-play'(el) {
    const e = state.feed?.episodes[Number(el.dataset.index)];
    if (!e) return;
    await library.keepEpisode(e);
    await load(e.id, {play: true});
    toast('Saved to your library', {action: {label: 'Follow show', run: () => library.subscribe(state.url)}});
  },
});

export default {render, enter: url => { if (url && url !== state.url && !store.feedById.has(url)) fetchPreview(url); }, title: () => state.feed?.title || 'Podcast'};

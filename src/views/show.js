import {html, on, go, plainText, safeHref} from '../ui/dom.js';
import {icon} from '../ui/icons.js';
import {cover, episodeRow, iconBtn, empty} from '../ui/parts.js';
import {toast, ask, openSheet, closeSheet} from '../ui/feedback.js';
import {store, visible} from '../services/store.js';
import * as library from '../services/library.js';
import {openShowSettings} from './sheets.js';

const PAGE = 40;
const ui = {id: '', q: '', hidePlayed: false, limit: PAGE, busy: false};

/** Shared header for subscribed shows and directory previews. */
export function showHeader(f, actions) {
  const notes = plainText(f.description);
  return html`<header class="show-head">
    ${cover(f.image, f.title, 'xxl')}
    <div class="show-info">
      <h1>${f.titleOverride || f.title || f.url}</h1>
      ${f.author ? html`<p class="muted">${f.author}</p>` : ''}
      <div class="action-row">${actions}</div>
      ${notes ? html`<details class="notes clamp"><summary>About</summary><p>${notes}</p></details>` : ''}
      <div class="link-row">
        ${safeHref(f.link) ? html`<a class="chip" href="${safeHref(f.link)}" target="_blank" rel="noopener noreferrer">${icon('external')}Website</a>` : ''}
        ${(f.funding || []).filter(x => safeHref(x.url)).map(x => html`<a class="chip" href="${safeHref(x.url)}" target="_blank" rel="noopener noreferrer">${icon('heart')}${x.title || 'Support'}</a>`)}
        ${(f.tags || []).map(t => html`<span class="chip static">${t}</span>`)}
      </div>
    </div>
  </header>`;
}

function render(id) {
  const f = store.feedById.get(id);
  if (!f) return store.ready ? html`<div class="page">${iconBtn('left', 'Back', 'back')}${empty('rss', 'This show is not in your library.', html`<a class="btn" href="#/discover">${icon('search')}Discover</a>`)}</div>` : html`<div class="loading"></div>`;
  if (ui.id !== id) Object.assign(ui, {id, q: '', limit: PAGE});
  const q = ui.q.trim().toLocaleLowerCase();
  const list = store.episodes.filter(e => e.feedId === id && visible(e) && (!ui.hidePlayed || !e.played) && (!q || e.title.toLocaleLowerCase().includes(q))).sort((a, b) => (b.published || 0) - (a.published || 0));
  return html`<div class="page">
    <div class="crumbs">${iconBtn('left', 'Back', 'back')}</div>
    ${showHeader(f, html`
      <button type="button" class="btn" data-act="show-unsubscribe" data-id="${id}">${icon('check')}Following</button>
      ${iconBtn('refresh', 'Refresh', 'show-refresh', {id}, ui.busy ? 'spin' : '')}
      ${iconBtn('sliders', 'Show settings', 'show-settings', {id})}`)}
    ${f.newFeedUrl ? html`<div class="callout">${icon('info')}<span class="grow">This show moved to a new address.</span><button type="button" class="btn small" data-act="show-relocate" data-id="${id}">Update</button></div>` : ''}
    ${f.lastError ? html`<div class="callout error">${icon('alert')}<span>${f.lastError}</span></div>` : ''}
    <div class="toolbar">
      <label class="filter-field">${icon('search')}<input type="search" placeholder="Filter episodes" value="${ui.q}" data-input="show-q" aria-label="Filter episodes"></label>
      ${iconBtn('eye', ui.hidePlayed ? 'Show played' : 'Hide played', 'show-hide-played', {}, ui.hidePlayed ? 'on' : '')}
    </div>
    <div class="list-eps">${list.slice(0, ui.limit).map(e => episodeRow(e, {showFeed: false}))}</div>
    ${list.length > ui.limit ? html`<button type="button" class="btn ghost wide" data-act="show-more">${icon('down')}Show more (${list.length - ui.limit})</button>` : ''}
    ${f.nextPageUrl ? html`<button type="button" class="btn ghost wide" data-act="show-older" data-id="${id}">${icon('history')}Load older episodes</button>` : ''}
  </div>`;
}

const rerender = () => window.dispatchEvent(new Event('podlingua:render'));
on('click', {
  async 'show-refresh'(el) { ui.busy = true; rerender(); try { await library.refreshFeed(el.dataset.id); toast('Up to date'); } finally { ui.busy = false; rerender(); } },
  'show-settings': el => openShowSettings(el.dataset.id),
  'show-more': () => { ui.limit += PAGE * 2; rerender(); },
  'show-hide-played': () => { ui.hidePlayed = !ui.hidePlayed; rerender(); },
  async 'show-older'(el) { await library.loadOlder(el.dataset.id); toast('Older episodes added'); },
  async 'show-relocate'(el) {
    const f = store.feedById.get(el.dataset.id);
    if (await ask('Move to the new address?', {detail: f.newFeedUrl, confirm: 'Move'})) { await library.relocate(f.id, f.newFeedUrl); toast('Show updated'); }
  },
  'show-unsubscribe': el => openSheet(() => html`<button type="button" class="icon-btn sheet-close" data-act="sheet-close" aria-label="Close">${icon('close')}</button>
    <h2 class="sheet-title">Unfollow ${store.feedById.get(el.dataset.id)?.title}?</h2>
    <div class="menu">
      <button type="button" data-act="unsub" data-id="${el.dataset.id}">${icon('archive')}Unfollow, keep episodes</button>
      <button type="button" class="danger" data-act="unsub" data-id="${el.dataset.id}" data-remove="1">${icon('trash')}Unfollow and delete episodes</button>
    </div>`),
  async unsub(el) { closeSheet(); await library.unsubscribe(el.dataset.id, !!el.dataset.remove); toast('Unfollowed'); go('library/shows'); },
});
on('input', {'show-q': el => { ui.q = el.value; ui.limit = PAGE; rerender(); }});

export default {render, title: id => store.feedById.get(id)?.title || 'Show'};

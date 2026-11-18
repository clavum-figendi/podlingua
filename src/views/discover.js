import {html, on, go} from '../ui/dom.js';
import {icon} from '../ui/icons.js';
import {feedTile, empty} from '../ui/parts.js';
import {toast} from '../ui/feedback.js';
import {store} from '../services/store.js';
import {prefs, languageName} from '../services/prefs.js';
import * as library from '../services/library.js';
import {searchPodcasts, discoverPodcasts} from '../podcasts.js';
import {searchFyyd, searchPodcastIndex} from '../discovery-extra.js';
import {indexKeys} from './settings.js';

const DIRECTORIES = [['apple', 'Apple'], ['fyyd', 'fyyd'], ['podcastindex', 'Podcast Index']];
const state = {q: '', directory: 'apple', status: 'idle', message: '', results: [], choices: [], top: null, topCountry: '', controller: null, serial: 0};
const country = () => (store.state.settings.country || (globalThis.navigator?.language?.split('-')[1]) || 'US').toUpperCase();

function topics() {
  const lang = languageName(prefs.source !== 'auto' ? prefs.source : prefs.target);
  return [`Learn ${lang}`, `${lang} news`, `${lang} stories`, 'Science', 'History', 'Technology'];
}

async function request(kind, value) {
  state.controller?.abort();
  const controller = new AbortController(), serial = ++state.serial;
  state.controller = controller; state.status = 'loading'; state.choices = []; state.message = '';
  rerender();
  try {
    const options = {...library.net(), signal: controller.signal};
    if (kind === 'top') { state.top = await discoverPodcasts(country(), {signal: controller.signal}); state.topCountry = country(); }
    else if (kind === 'address') {
      const result = await library.addByAddress(value);
      if (serial !== state.serial) return;
      if (result.feed) { toast(`Subscribed to ${result.feed.title || 'podcast'}`); go('show/' + encodeURIComponent(result.feed.id)); return; }
      state.choices = result.choices;
    } else {
      const q = value.trim();
      state.results = state.directory === 'fyyd' ? await searchFyyd(q, options)
        : state.directory === 'podcastindex' ? await searchPodcastIndex(q, {...indexKeys, consent: true, signal: controller.signal})
          : await searchPodcasts(q, {country: country(), signal: controller.signal});
      state.message = state.results.length ? '' : 'No podcasts found. Try other words or another directory.';
    }
    if (serial === state.serial) state.status = 'idle';
  } catch (error) {
    if (serial !== state.serial) return;
    state.status = 'error'; state.message = error.message;
  } finally { if (serial === state.serial) { state.controller = null; rerender(); } }
}
let rerender = () => {};

function render() {
  const loading = state.status === 'loading', showingResults = state.q.trim() && state.results.length;
  const indexReady = indexKeys.apiKey && indexKeys.apiSecret;
  return html`<div class="page">
    <header class="page-head"><h1>Discover</h1></header>
    <form class="search" data-submit="discover-search" role="search">
      ${icon(library.isUrlInput(state.q) ? 'link' : 'search')}
      <input id="discover-q" type="search" name="q" value="${state.q}" placeholder="Show, topic or feed link" autocomplete="off" enterkeyhint="search" data-input="discover-q" aria-label="Search podcasts or paste a feed link">
      ${loading ? html`<button type="button" class="icon-btn" data-act="discover-cancel" aria-label="Cancel">${icon('close')}</button>` : html`<button class="btn primary small" aria-label="${library.isUrlInput(state.q) ? 'Add' : 'Search'}">${library.isUrlInput(state.q) ? icon('plus') : icon('search')}</button>`}
    </form>
    <div class="chips" role="radiogroup" aria-label="Directory">
      ${DIRECTORIES.map(([id, label]) => html`<button type="button" role="radio" class="chip ${state.directory === id ? 'on' : ''}" aria-checked="${state.directory === id}" data-act="discover-dir" data-id="${id}">${id === 'podcastindex' && !indexReady ? icon('key') : ''}${label}</button>`)}
    </div>
    ${loading ? html`<div class="loading" aria-busy="true" aria-label="Searching"></div>` : ''}
    ${state.status === 'error' ? html`<div class="callout error">${icon('alert')}<span>${state.message}</span><button type="button" class="btn small" data-act="discover-retry">${icon('refresh')}Retry</button></div>` : state.message ? empty('search', state.message) : ''}
    ${state.choices.length ? html`<section><h2 class="section-title">${icon('rss')}Feeds on this site</h2><div class="list">${state.choices.map(c => html`<button type="button" class="row-btn" data-act="subscribe" data-url="${c.url}">${icon('rss')}<span class="grow">${c.title}</span>${icon('plus')}</button>`)}</div></section>` : ''}
    ${showingResults ? html`<section><div class="grid-tiles">${state.results.map(f => feedTile(f, {subscribed: false}))}</div></section>` : html`
      <div class="chips topics">${topics().map(t => html`<button type="button" class="chip" data-act="discover-topic" data-id="${t}">${t}</button>`)}</div>
      <section><div class="section-head"><h2>${icon('stats')}Top in ${new Intl.DisplayNames([navigator.language || 'en'], {type: 'region'}).of(country()) || country()}</h2></div>
      ${state.top ? html`<div class="grid-tiles">${state.top.map(f => feedTile(f, {subscribed: false}))}</div>` : loading ? '' : html`<button type="button" class="btn" data-act="discover-top">${icon('refresh')}Load charts</button>`}</section>`}
  </div>`;
}

on('input', {'discover-q': el => { state.q = el.value; if (!el.value.trim()) { state.results = []; state.message = ''; state.choices = []; } rerender(); }});
on('submit', {'discover-search': form => {
  const q = String(new FormData(form).get('q') || '').trim();
  state.q = q;
  if (!q) return;
  if (library.isUrlInput(q)) return request('address', q);
  if (state.directory === 'podcastindex' && !(indexKeys.apiKey && indexKeys.apiSecret)) { toast('Add your Podcast Index keys in Settings › Advanced.'); return go('settings'); }
  return request('search', q);
}});
on('click', {
  'discover-dir': el => { state.directory = el.dataset.id; if (state.q.trim() && !library.isUrlInput(state.q)) document.querySelector('form.search')?.requestSubmit(); else rerender(); },
  'discover-topic': el => { state.q = el.dataset.id; request('search', state.q); },
  'discover-cancel': () => { state.controller?.abort(); state.serial++; state.status = 'idle'; state.controller = null; rerender(); },
  'discover-retry': () => request(state.q.trim() ? (library.isUrlInput(state.q) ? 'address' : 'search') : 'top', state.q),
  'discover-top': () => request('top'),
});

export default {
  render, title: () => 'Discover',
  enter() { rerender = () => window.dispatchEvent(new Event('podlingua:render')); if (!state.top || state.topCountry !== country()) request('top'); },
  leave() { rerender = () => {}; },
};

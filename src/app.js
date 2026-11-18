import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource-variable/literata';
import './styles/app.css';
import {html, raw, patch, on, setErrorHandler, guard, go} from './ui/dom.js';
import {icon} from './ui/icons.js';
import {cover, ring} from './ui/parts.js';
import {toast, refreshSheet, sheetOpen} from './ui/feedback.js';
import {store, onStore, reload, coverOf, showTitle} from './services/store.js';
import {onPrefs} from './services/prefs.js';
import {onJobs, jobs, setBlockedHandler} from './services/jobs.js';
import {media, player, onPlayer, onTick, load, toggle, skipBy, current} from './services/player.js';
import * as library from './services/library.js';
import {onOffline} from './services/offline.js';
import {openEpisode, openActivity, openAudioHelp, openProcess} from './views/sheets.js';
import home from './views/home.js';
import discover from './views/discover.js';
import libraryView from './views/library.js';
import show from './views/show.js';
import preview from './views/preview.js';
import reader from './views/reader.js';
import settings from './views/settings.js';
import stats from './views/stats.js';

const routes = {home, discover, library: libraryView, show, preview, play: reader, settings, stats};
const tabs = [['home', 'home', 'Listen'], ['discover', 'discover', 'Discover'], ['library', 'library', 'Library']];

document.querySelector('#app').innerHTML = String(html`
  <div class="shell">
    <nav class="rail" aria-label="Main">
      <a class="brand" href="#/home" aria-label="Podlingua home">${raw('<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--lagoon)"/><rect x="7" y="10" width="18" height="4" rx="2" fill="#fff"/><rect x="7" y="18" width="12" height="4" rx="2" fill="var(--marker)"/></svg>')}<span>podlingua</span></a>
      ${tabs.map(([route, glyph, label]) => html`<a class="rail-link" href="#/${route}" data-route="${route}">${icon(glyph)}<span>${label}</span></a>`)}
      <button type="button" class="rail-link rail-activity" data-act="activity" hidden>${icon('wave')}<span>Activity</span></button>
      <a class="rail-link rail-settings" href="#/settings" data-route="settings">${icon('settings')}<span>Settings</span></a>
    </nav>
    <main id="view" tabindex="-1"></main>
    <div id="player"></div>
  </div>
  <div id="media-dock"></div>`);
document.querySelector('#media-dock').append(media);

setErrorHandler(error => { console.error(error); toast(error?.message || String(error), {error: true}); });

let route = {name: 'home', args: []};
const parse = () => {
  const [name = 'home', ...args] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  return {name: routes[name] ? name : 'home', args: args.map(decodeURIComponent)};
};

let frame = 0;
function render() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const view = routes[route.name];
    patch(document.querySelector('#view'), String(view.render(...route.args)));
    view.mounted?.();
    renderPlayer();
    for (const a of document.querySelectorAll('[data-route]')) a.toggleAttribute('aria-current', a.dataset.route === route.name || (route.name === 'show' && a.dataset.route === 'library') || (route.name === 'preview' && a.dataset.route === 'discover'));
    const activity = document.querySelector('.rail-activity'), active = jobs.some(j => j.status === 'running' || j.status === 'queued');
    activity.hidden = !jobs.length; activity.classList.toggle('busy', active);
    document.body.classList.toggle('route-play', route.name === 'play');
    document.body.classList.toggle('has-video', player.hasVideo);
    document.documentElement.dataset.theme = store.state.settings.theme || 'system';
    if (sheetOpen()) refreshSheet();
  });
}

function navigate() {
  const next = parse();
  if (next.name !== route.name) routes[route.name].leave?.();
  route = next;
  routes[route.name].enter?.(...route.args);
  document.title = `${routes[route.name].title?.(...route.args) || 'Podlingua'} · Podlingua`;
  render();
  requestAnimationFrame(() => { window.scrollTo(0, 0); document.querySelector('#view').scrollTop = 0; });
}

function renderPlayer() {
  const e = current(), el = document.querySelector('#player');
  el.hidden = !e || route.name === 'play';
  if (el.hidden) return;
  const running = jobs.find(j => j.status === 'running');
  patch(el, String(html`
    <div class="mini" data-key="mini">
      <span class="mini-progress"><i id="mini-progress"></i></span>
      <button type="button" class="mini-open" data-act="read" data-id="${e.id}" aria-label="Open player and transcript">
        ${cover(coverOf(e), showTitle(e) || e.title, 'sm')}
        <span class="mini-text"><span class="mini-title">${e.title}</span><span class="mini-sub">${running ? html`${ring(running.progress)} ${running.message || 'Working'}` : player.error || showTitle(e)}</span></span>
      </button>
      <span class="mini-controls">
        <button type="button" class="icon-btn hide-sm" data-act="skip" data-dir="-1" aria-label="Skip back">${icon('back')}</button>
        <button type="button" class="play-btn" data-act="toggle" aria-label="${media.paused ? 'Play' : 'Pause'}">${icon(media.paused ? 'play' : 'pause')}</button>
        <button type="button" class="icon-btn" data-act="skip" data-dir="1" aria-label="Skip forward">${icon('forward')}</button>
      </span>
    </div>`));
  updateMini(media);
}
function updateMini(m) {
  const bar = document.querySelector('#mini-progress');
  if (bar) bar.style.width = `${m.duration ? (m.currentTime / m.duration * 100).toFixed(2) : 0}%`;
}

on('click', {
  async play(el) {
    const id = el.dataset.id, e = store.byId.get(id);
    if (player.id === id && media.currentSrc) return toggle();
    if (e && !e.audio && !e.audioUrl) { await load(id); return go('play'); }
    await load(id, {play: true});
  },
  async read(el) { if (el.dataset.id && el.dataset.id !== player.id) await load(el.dataset.id); go('play'); },
  toggle: () => toggle(),
  skip: el => skipBy(Number(el.dataset.dir)),
  episode: el => openEpisode(el.dataset.id),
  process: el => openProcess(el.dataset.id, el.dataset.kind),
  activity: () => openActivity(),
  back: () => history.length > 1 ? history.back() : go('home'),
  go: el => go(el.dataset.to),
  show: el => go('show/' + encodeURIComponent(el.dataset.id)),
  preview: el => go('preview/' + encodeURIComponent(el.dataset.id)),
  async subscribe(el) { const feed = await library.subscribe(el.dataset.url); toast(`Subscribed to ${feed.title || 'podcast'}`, {action: {label: 'Open', run: () => go('show/' + encodeURIComponent(feed.id))}}); },
  async 'queue-toggle'(el) { const id = el.dataset.id, queued = store.state.queue.includes(id); await library.queue(queued ? 'remove' : 'add', queued ? {id} : {ids: [id]}); toast(queued ? 'Removed from queue' : 'Added to queue'); },
  'queue-remove': el => library.queue('remove', {id: el.dataset.id}),
  'queue-move': el => library.queue('move', {id: el.dataset.id, delta: Number(el.dataset.delta)}),
});

setBlockedHandler(id => openAudioHelp(id));
onStore(render); onPrefs(render); onJobs(render); onPlayer(render); onOffline(render);
onTick(m => { updateMini(m); routes[route.name].tick?.(m); });

document.addEventListener('keydown', guard(async e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]') || e.target.closest('input,textarea,select,[contenteditable]')) return;
  if (e.key === ' ' && !e.target.closest('button,a') && player.id) { e.preventDefault(); await toggle(); }
  else if (e.key === 'ArrowLeft' && player.id) skipBy(-1);
  else if (e.key === 'ArrowRight' && player.id) skipBy(1);
  else if (e.key === '/') { e.preventDefault(); go('discover'); requestAnimationFrame(() => document.querySelector('#discover-q')?.focus()); }
}));

window.addEventListener('hashchange', navigate);
window.addEventListener('podlingua:render', render);
library.startAutomation(error => toast(error.message, {error: true}));
await reload().catch(error => toast(error.message, {error: true}));
if (store.state.lastEpisodeId && store.byId.has(store.state.lastEpisodeId)) load(store.state.lastEpisodeId).catch(() => {});
navigate();

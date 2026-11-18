import {listEpisodes} from '../storage.js';
import {listSubscriptions, getAppState} from '../catalog.js';

/** Single in-memory snapshot of the persistent library, refreshed after every mutation. */
export const store = {episodes: [], feeds: [], state: {queue: [], settings: {}, stats: {}, downloadLog: []}, byId: new Map(), feedById: new Map(), ready: false};
const listeners = new Set();
export const onStore = fn => (listeners.add(fn), () => listeners.delete(fn));

let frame = 0;
export function notify() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; for (const fn of listeners) fn(store); });
}

function index() {
  store.byId = new Map(store.episodes.map(e => [e.id, e]));
  store.feedById = new Map(store.feeds.map(f => [f.id, {...f, title: f.titleOverride || f.title || f.url}]));
}

let inflight = null, again = false;
/** Coalesces concurrent reload requests into at most one trailing read. */
export function reload() {
  if (inflight) { again = true; return inflight; }
  inflight = (async () => {
    do {
      again = false;
      const [episodes, feeds, state] = await Promise.all([listEpisodes(), listSubscriptions(), getAppState()]);
      Object.assign(store, {episodes, feeds, state, ready: true});
      index();
    } while (again);
    notify();
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Replace one cached episode without a full reload; `quiet` skips re-rendering (e.g. position saves). */
export function put(episode, {quiet = false} = {}) {
  if (!episode) return;
  const i = store.episodes.findIndex(e => e.id === episode.id);
  if (i >= 0) store.episodes[i] = episode; else store.episodes.unshift(episode);
  store.byId.set(episode.id, episode);
  if (!quiet) notify();
}

export const feedOf = episode => episode?.feedId ? store.feedById.get(episode.feedId) : undefined;
export const coverOf = episode => episode?.image || feedOf(episode)?.image || '';
export const showTitle = episode => feedOf(episode)?.title || (episode?.feedId ? '' : 'My files');
export const inQueue = id => store.state.queue.includes(id);
export const visible = e => store.state.settings.includeExplicit !== false || !e.explicit;

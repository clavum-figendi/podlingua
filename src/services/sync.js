import {createSyncClient} from '../connections.js';
import {listSubscriptions, subscribe, unsubscribe} from '../catalog.js';
import {safeUrl} from '../podcasts.js';
import {patchEpisode} from '../library-services.js';
import {listEpisodes, getEpisode} from '../storage.js';
import {net} from './library.js';
import {reload} from './store.js';

/** gpodder / Nextcloud gpoddersync exchange. Nothing is sent without an explicit call. */
export async function previewSync(config) {
  return createSyncClient(config).pull();
}

export async function applySync(preview, {removeLocal = false} = {}) {
  const errors = [], subscriptions = await listSubscriptions(), existing = new Set(subscriptions.flatMap(s => [s.id, s.url]));
  let added = 0;
  for (const value of preview.subscriptions.add) {
    const url = safeUrl(value);
    if (!url) { errors.push('Unsupported feed URL'); continue; }
    if (!existing.has(url)) { try { await subscribe(url, net()); added++; } catch (error) { errors.push(error.message); } }
  }
  if (removeLocal) for (const value of preview.subscriptions.remove) {
    const url = safeUrl(value), match = subscriptions.find(s => s.id === url || s.url === url);
    if (match) await unsubscribe(match.id);
  }
  const episodes = await listEpisodes(), feeds = await listSubscriptions();
  for (const action of [...preview.actions.actions].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))) {
    const episode = episodes.find(e => e.audioUrl === action.episode && (e.feedId === action.podcast || feeds.some(f => f.id === e.feedId && f.url === action.podcast)));
    const at = Date.parse(typeof action.timestamp === 'string' ? (action.timestamp.endsWith('Z') ? action.timestamp : action.timestamp + 'Z') : '');
    if (!episode || action.action !== 'play' || !Number.isFinite(at) || !Number.isFinite(action.position) || action.position < 0 || action.position > 31536000) continue;
    const fresh = await getEpisode(episode.id);
    if (!fresh || at <= Number(fresh.playedAt || 0)) continue;
    await patchEpisode(episode.id, current => at <= Number(current.playedAt || 0) ? null : {position: action.position, playedAt: at, ...(Number.isFinite(action.total) && action.total > 0 && action.position >= action.total ? {played: true} : {})});
  }
  await reload();
  return {added, errors};
}

export async function pushSync(config) {
  const client = createSyncClient(config), feeds = await listSubscriptions(), episodes = await listEpisodes();
  const actions = episodes.filter(e => e.feedId && e.audioUrl && Number.isFinite(e.position) && e.playedAt).map(e => ({
    podcast: feeds.find(f => f.id === e.feedId)?.url || e.feedId, episode: e.audioUrl, device: config.device, action: 'play',
    timestamp: new Date(e.playedAt).toISOString().replace(/\.\d{3}Z$/, ''), started: 0, position: Math.floor(e.position), total: Math.floor(e.duration || 0),
  }));
  await client.push(feeds.map(f => f.url), [], actions);
  const remote = new Set((await client.pull()).subscriptions.add);
  return {feeds: feeds.length, verified: feeds.every(f => remote.has(f.url))};
}

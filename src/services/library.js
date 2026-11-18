import {getEpisode, saveEpisode, deleteEpisode, listEpisodes} from '../storage.js';
import * as catalog from '../catalog.js';
import {fetchFeed, parseFeed, parseOPML, exportOPML, parseChapters, safeUrl} from '../podcasts.js';
import {discoverWebsite} from '../discovery-extra.js';
import {parseTranscript} from '../core.js';
import {parseID3Chapters} from '../media-tags.js';
import {createBackup, parseBackup, fetchMedia, downloadEpisode, removeDownload as dropAudio, publisherTranscript as fetchPublisherTranscript, patchEpisode} from '../library-services.js';
import {mutateQueue, importLocalFiles, clearHistory as wipeHistory, resetStatistics as wipeStats, matchesDownloadFilter} from '../parity.js';
import {store, reload, put} from './store.js';

const bridge = {getEpisode, saveEpisode, listEpisodes};
export const settings = () => store.state.settings || {};
/** Network options are derived from the user's explicit proxy consent only. */
export const net = () => ({proxy: settings().allowProxy === true ? settings().proxy || '' : '', allowProxy: settings().allowProxy === true});

window.addEventListener('podlingua:library', () => { reload(); });

export async function patch(id, values, options) { const saved = await patchEpisode(id, values); put(saved, options); return saved; }

export async function toggle(id, key) {
  const e = await getEpisode(id);
  if (!e) throw new Error('This episode no longer exists.');
  const value = !e[key];
  await patchEpisode(id, {[key]: value, ...(key === 'played' ? {playedAt: value ? Date.now() : null, ...(value ? {} : {position: 0})} : {})});
  if (key === 'played' && value && store.state.queue.includes(id)) await mutateQueue({type: 'complete', id}, store.episodes);
  await reload();
  return value;
}

export async function bulk(ids, op) {
  if (op === 'queue') return queue('add', {ids});
  for (const id of ids) {
    if (op === 'delete') await deleteEpisode(id);
    else await patchEpisode(id, op === 'played' || op === 'unplayed' ? {played: op === 'played', playedAt: op === 'played' ? Date.now() : null} : op === 'archive' || op === 'unarchive' ? {archived: op === 'archive'} : {favorite: op === 'favorite'});
  }
  if (op === 'delete' || op === 'played') await catalog.mutateAppState(s => ({...s, queue: s.queue.filter(x => !ids.includes(x))}));
  await reload();
}

export async function queue(type, args = {}) {
  await mutateQueue({type, currentId: store.state.lastEpisodeId, ...args}, store.episodes);
  await reload();
}

export async function saveSettings(patchValues) {
  await catalog.mutateAppState(s => ({...s, settings: {...s.settings, ...patchValues}}));
  await reload();
}

/** Copies media into browser storage; identical files are de-duplicated by content hash. */
export async function importAudio(files, onProgress) {
  const result = await importLocalFiles(files, bridge, {onProgress});
  await reload();
  return result;
}

export async function importTranscript(file, episodeId) {
  const doc = parseTranscript(await file.text(), file.name);
  const target = episodeId && await getEpisode(episodeId);
  const saved = target ? await saveEpisode({...target, doc}) : await saveEpisode({id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), doc, createdAt: Date.now()});
  await reload();
  return saved;
}

export async function removeEpisodes(ids) {
  for (const id of ids) await deleteEpisode(id);
  await catalog.mutateAppState(s => ({...s, queue: s.queue.filter(x => !ids.includes(x)), ...(ids.includes(s.lastEpisodeId) ? {lastEpisodeId: ''} : {})}));
  await reload();
}

// Hosts that refused direct browser copying in this page session; retry is explicit.
const blocked = new Map();
export const isBlocked = id => blocked.has(id) && blocked.get(id) === store.byId.get(id)?.audioUrl;
export async function download(id, {signal, onProgress, retry = false} = {}) {
  const episode = await getEpisode(id);
  if (episode?.audio) return episode;
  if (!retry && isBlocked(id)) { const e = new Error('This publisher blocks direct downloads.'); e.code = 'MEDIA_NETWORK_BLOCKED'; throw e; }
  try {
    const saved = await downloadEpisode(id, {signal, onProgress});
    blocked.delete(id);
    await reload();
    return saved;
  } catch (error) {
    if (error.code === 'MEDIA_NETWORK_BLOCKED') blocked.set(id, episode?.audioUrl);
    await reload();
    throw error;
  }
}
export async function removeDownload(id) { put(await dropAudio(id)); }

export async function attachAudio(id, file) {
  if (!/^(audio|video)\//.test(file.type) && !/\.(mp3|m4a|m4b|wav|ogg|opus|flac|aac|mp4|webm)$/i.test(file.name)) throw new Error('Choose an audio or video file.');
  if (!file.size || file.size > 512 * 1024 * 1024) throw new Error('Choose a recording smaller than 512 MB.');
  const saved = await patch(id, {audio: file, downloadedAt: Date.now(), mediaType: file.type || 'audio/mpeg'});
  blocked.delete(id);
  return saved;
}

export async function publisherTranscript(id) {
  const saved = await fetchPublisherTranscript(id, net());
  put(saved);
  return saved;
}

export async function loadChapters(id) {
  const episode = await getEpisode(id);
  if (!episode) throw new Error('This episode no longer exists.');
  if (episode.chapters?.length) return episode.chapters;
  let chapters = [];
  if (episode.chaptersUrl) chapters = parseChapters(JSON.parse(await (await fetchMedia(episode.chaptersUrl, {maxMB: 5, ...net()})).text()));
  else if (episode.audio) chapters = parseID3Chapters(await episode.audio.slice(0, 16 * 1024 * 1024 + 10).arrayBuffer());
  if (chapters.length) await patch(id, {chapters});
  return chapters;
}

const looksLikeUrl = value => /^https?:\/\//i.test(value.trim()) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value.trim());
export const isUrlInput = looksLikeUrl;

/** Accepts a feed address or a website; websites are scanned for advertised feeds. */
export async function addByAddress(input) {
  const url = safeUrl(/^https?:/i.test(input.trim()) ? input.trim() : 'https://' + input.trim());
  if (!url) throw new Error('Enter a secure https:// address.');
  try { return {feed: await subscribe(url)}; } catch (error) {
    if (!/RSS|Atom|XML|DTD/i.test(error.message)) throw error;
    const feeds = await discoverWebsite(url, net());
    if (!feeds.length) throw new Error('No podcast feed found at this address.');
    if (feeds.length === 1) return {feed: await subscribe(feeds[0].url)};
    return {choices: feeds};
  }
}

export async function subscribe(url) { const feed = await catalog.subscribe(url, net()); await reload(); return feed; }
export const previewFeed = url => fetchFeed(url, net());
export async function keepEpisode(episode) {
  const existing = await getEpisode(episode.id);
  if (!existing) await saveEpisode({...episode, createdAt: Date.now()});
  await reload();
}
export async function unsubscribe(id, removeEpisodes = false) { await catalog.unsubscribe(id, {removeEpisodes}); await reload(); }
export async function refreshFeed(id) { await catalog.refreshSubscription(id, net()); await reload(); }
export async function refreshAll() {
  const failures = [];
  for (const f of store.feeds) { try { await catalog.refreshSubscription(f.id, net()); } catch (error) { failures.push(`${f.titleOverride || f.title}: ${error.message}`); } }
  await reload();
  return failures;
}
export async function relocate(id, url) { await catalog.relocateSubscription(id, url, net()); await reload(); }
export async function loadOlder(id) { await catalog.loadArchivePage(id, net()); await reload(); }
export async function saveFeed(id, values) { await catalog.saveSubscription({...store.feeds.find(f => f.id === id), ...values, id}); await reload(); }

export async function importOPML(file, onProgress) {
  const entries = parseOPML(await file.text()), errors = [];
  let done = 0;
  for (const entry of entries) {
    try { await catalog.subscribe(entry.url, net()); if (entry.tags?.length) await catalog.saveSubscription({id: safeUrl(entry.url), tags: entry.tags}); } catch (error) { errors.push(`${entry.title || entry.url}: ${error.message}`); }
    onProgress?.(++done, entries.length);
  }
  await reload();
  return {count: entries.length - errors.length, errors};
}
export const opmlBlob = () => new Blob([exportOPML(store.feeds)], {type: 'text/x-opml'});

export async function importFeedFile(file, url) {
  const {episodes, ...meta} = parseFeed(await file.text(), url);
  await catalog.saveSubscription({...store.feeds.find(f => f.id === meta.id), ...meta});
  for (const ep of episodes) { const old = await getEpisode(ep.id); await saveEpisode(old ? {...ep, ...old} : {...ep, createdAt: Date.now()}); }
  await reload();
}

export async function backupBlob(includeAudio) {
  return createBackup({episodes: await listEpisodes(), subscriptions: await catalog.listSubscriptions(), state: await catalog.getAppState()}, includeAudio);
}
export async function restoreBackup(file) {
  const data = await parseBackup(file);
  for (const feed of data.subscriptions) await catalog.saveSubscription(feed);
  for (const episode of data.episodes) { const existing = await getEpisode(episode.id); await saveEpisode({...existing, ...episode, revision: existing?.revision}); }
  await catalog.setAppState(data.state);
  await reload();
  return data;
}

export async function clearHistory() { await wipeHistory(bridge); await reload(); }
export async function resetStatistics() { await wipeStats(bridge); await reload(); }

/** Foreground-only refresh and auto-download, both opt-in in settings. */
export function startAutomation(onError) {
  let busy = false;
  setInterval(async () => {
    if (busy || document.hidden) return;
    const prefs = settings();
    if (!(prefs.refreshMinutes > 0) && !prefs.autoDownload) return;
    busy = true;
    try {
      if (prefs.refreshMinutes > 0) for (const feed of store.feeds) if (feed.keepUpdated !== false && Date.now() - (feed.lastRefresh || 0) > prefs.refreshMinutes * 60000) await catalog.refreshSubscription(feed.id, net());
      if (prefs.autoDownload) {
        await reload();
        const limit = Number.isFinite(prefs.autoDownloadLimit) ? prefs.autoDownloadLimit : 3;
        const capacity = Math.max(0, limit - store.episodes.filter(e => e.audio && e.downloadedAt).length);
        const picks = store.episodes.filter(e => e.audioUrl && !e.audio && !e.played && !e.archived && !isBlocked(e.id) && (prefs.includeExplicit !== false || !e.explicit) && store.feeds.some(f => f.id === e.feedId && f.autoDownload && matchesDownloadFilter(e, f)))
          .sort((a, b) => (b.published || 0) - (a.published || 0)).slice(0, capacity);
        for (const e of picks) await download(e.id).catch(() => {});
      }
      await reload();
    } catch (error) { onError(error); } finally { busy = false; }
  }, 60000);
}

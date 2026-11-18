import {resumePosition, nextQueued, listeningDelta} from '../playback.js';
import {patchEpisode, safePodcastURL, removeDownload} from '../library-services.js';
import {mutateAppState, setAppState, saveSubscription} from '../catalog.js';
import {getEpisode} from '../storage.js';
import {decodeTo16kPCM, encodeWav} from '../engines.js';
import {findSilence, normalizationGain} from '../audio-enhancements.js';
import {store, put, reload, feedOf, coverOf} from './store.js';
import {settings} from './library.js';

/** One media element for the whole app; video episodes are shown in the reader's media dock. */
export const media = Object.assign(document.createElement('video'), {preload: 'metadata', playsInline: true});
media.id = 'media';

export const player = {
  id: null, rate: 1, error: '', hasVideo: false,
  sleep: {deadline: 0, end: false}, loop: {a: null, b: null},
  clarity: {status: 'idle', ranges: [], gain: 1, skip: false, level: false},
};
const listeners = new Set(), tickers = new Set();
export const onPlayer = fn => (listeners.add(fn), () => listeners.delete(fn));
export const onTick = fn => (tickers.add(fn), () => tickers.delete(fn));
const emit = () => { for (const fn of listeners) fn(player); };
const tick = () => { for (const fn of tickers) fn(media); };
export const current = () => player.id ? store.byId.get(player.id) : undefined;

let objectURL = '', sourceURL = '', leveledURL = '', pcm = null, generation = 0, finished = false;
let lastMedia = 0, lastWall = performance.now(), wallTotal = 0, mediaTotal = 0, lastFlush = 0, flushChain = Promise.resolve();
const tabId = crypto.randomUUID();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('podlingua-playback') : null;
channel?.addEventListener('message', e => { if (e.data?.type === 'playing' && e.data.tabId !== tabId) media.pause(); });

/** Persists position and measured listening time; listening is never inferred from seeking. */
export function flush() {
  const id = player.id;
  if (!id || !media.currentSrc) return flushChain;
  const position = Number.isFinite(media.currentTime) ? media.currentTime : 0, total = Number.isFinite(media.duration) ? media.duration : undefined, wall = wallTotal, amount = mediaTotal;
  wallTotal = 0; mediaTotal = 0; lastFlush = performance.now();
  flushChain = flushChain.catch(() => {}).then(async () => {
    const saved = await patchEpisode(id, e => ({position, ...(total ? {duration: total} : {}), ...(wall > 0 ? {playedAt: Date.now(), listenedSeconds: (Number(e.listenedSeconds) || 0) + wall} : {})}));
    put(saved, {quiet: true});
    if (wall > 0) await mutateAppState(state => {
      const old = state.stats || {}, day = new Date().toISOString().slice(0, 10), daily = Array.isArray(old.daily) ? old.daily.slice(-3650) : [], entry = daily.find(d => d.day === day);
      if (entry) entry.seconds += wall; else daily.push({day, seconds: wall});
      return {...state, stats: {...old, listeningSeconds: (Number(old.listeningSeconds) || 0) + wall, totalMediaSeconds: (Number(old.totalMediaSeconds) || 0) + amount, daily}};
    });
  }).catch(() => {});
  return flushChain;
}

function resetClarity() {
  if (leveledURL) URL.revokeObjectURL(leveledURL);
  leveledURL = ''; pcm = null;
  player.clarity = {status: 'idle', ranges: [], gain: 1, skip: false, level: false};
}

export async function load(id, {play = false, at} = {}) {
  if (player.id === id && media.currentSrc) { if (Number.isFinite(at)) media.currentTime = at; if (play) await resume(); return; }
  await flush();
  const gen = ++generation;
  const episode = await getEpisode(id);
  if (!episode) throw new Error('This episode no longer exists.');
  if (gen !== generation) return;
  media.pause();
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = '';
  resetClarity();
  Object.assign(player, {id, error: '', hasVideo: false, loop: {a: null, b: null}});
  finished = false;
  sourceURL = episode.audio ? (objectURL = URL.createObjectURL(episode.audio)) : episode.audioUrl ? safePodcastURL(episode.audioUrl) : '';
  if (sourceURL) media.src = sourceURL; else media.removeAttribute('src');
  media.load();
  const feed = feedOf(episode), prefs = settings();
  player.rate = Number(feed?.speed) || Number(prefs.defaultSpeed) || 1;
  media.playbackRate = media.defaultPlaybackRate = player.rate;
  if (sourceURL) media.addEventListener('loadedmetadata', () => {
    if (gen !== generation) return;
    media.currentTime = Number.isFinite(at) ? at : resumePosition(episode, media.duration, {skipIntro: feed?.skipIntro, rememberPosition: prefs.rememberPosition});
    player.hasVideo = media.videoWidth > 0;
    lastMedia = media.currentTime; lastWall = performance.now();
    emit(); tick();
  }, {once: true});
  setAppState({lastEpisodeId: id}).catch(() => {});
  store.state.lastEpisodeId = id;
  if ('mediaSession' in navigator) {
    try { const art = coverOf(episode); navigator.mediaSession.metadata = new MediaMetadata({title: episode.title, artist: feed?.author || feed?.title || 'Podlingua', album: feed?.title || '', artwork: art ? [{src: art, sizes: '512x512'}] : []}); } catch { /* Unsupported metadata. */ }
  }
  emit(); tick();
  if (play && sourceURL) await resume();
}

export async function resume() {
  try { await media.play(); } catch (error) { if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') throw error; }
}
export const toggle = () => media.paused ? resume() : media.pause();
export function seek(seconds) {
  if (!Number.isFinite(seconds)) return;
  media.currentTime = Math.max(0, Math.min(Number.isFinite(media.duration) ? media.duration : seconds, seconds));
  tick();
}
export const skipBy = direction => seek(media.currentTime + (direction < 0 ? -Number(settings().skipBack ?? 10) : Number(settings().skipForward ?? 30)));

export async function setRate(rate) {
  player.rate = media.playbackRate = media.defaultPlaybackRate = rate;
  emit();
  const feed = feedOf(current());
  if (feed) await saveSubscription({id: feed.id, speed: rate}); else await mutateAppState(s => ({...s, settings: {...s.settings, defaultSpeed: rate}}));
  await reload();
}

export async function next() {
  const id = nextQueued(store.state.queue, store.episodes, player.id, store.state.settings.skipCompleted !== false);
  if (!id) return false;
  await load(id, {play: true});
  return true;
}

export function setSleep(value) {
  player.sleep = value === 'end' ? {deadline: 0, end: true} : {deadline: value ? Date.now() + value * 60000 : 0, end: false};
  emit();
}
export const sleepRemaining = () => player.sleep.deadline ? Math.max(0, player.sleep.deadline - Date.now()) : 0;

export function markLoop() {
  const {a, b} = player.loop, t = media.currentTime;
  if (a === null || b !== null) player.loop = {a: t, b: null};
  else if (t > a) { player.loop = {a, b: t}; media.currentTime = a; }
  else player.loop = {a: t, b: null};
  emit();
}
export const clearLoop = () => { player.loop = {a: null, b: null}; emit(); };

export async function addBookmark() {
  if (!player.id) throw new Error('Play an episode first.');
  const position = media.currentTime;
  put(await patchEpisode(player.id, e => ({bookmarks: [...(e.bookmarks || []), {id: crypto.randomUUID(), position, label: '', createdAt: Date.now()}].slice(-1000)})));
  return position;
}
export async function removeBookmark(episodeId, markId) {
  put(await patchEpisode(episodeId, e => ({bookmarks: (e.bookmarks || []).filter(m => m.id !== markId)})));
}

/** Local-only analysis: silence ranges and a bounded gain; the stored recording is never altered. */
export async function analyzeClarity() {
  const episode = current();
  if (!episode?.audio) throw new Error('Download this episode first. Analysis runs on this device.');
  const gen = generation;
  player.clarity = {...player.clarity, status: 'analyzing'}; emit();
  try {
    const samples = await decodeTo16kPCM(episode.audio, new AbortController().signal, 100 * 1024 * 1024);
    if (gen !== generation) return;
    pcm = samples;
    player.clarity = {status: 'ready', ranges: findSilence(samples, 16000), gain: normalizationGain(samples), skip: true, level: false};
  } catch (error) {
    if (gen === generation) player.clarity = {...player.clarity, status: 'idle'};
    throw error;
  } finally { emit(); }
}
export function setClarity({skip, level}) {
  if (skip !== undefined) player.clarity.skip = skip;
  if (level !== undefined && pcm && level !== player.clarity.level) {
    player.clarity.level = level;
    const time = media.currentTime, playing = !media.paused, gen = generation;
    if (level) {
      const gain = player.clarity.gain;
      if (!leveledURL) leveledURL = URL.createObjectURL(new Blob([encodeWav(pcm.map(v => Math.max(-1, Math.min(1, v * gain))))], {type: 'audio/wav'}));
      media.src = leveledURL;
    } else media.src = sourceURL;
    media.addEventListener('loadedmetadata', () => { if (gen !== generation) return; media.currentTime = Math.min(time, media.duration); if (playing) resume(); }, {once: true});
    media.load();
  }
  emit();
}

export async function pictureInPicture() {
  if (!media.videoWidth || !media.requestPictureInPicture) throw new Error('Picture in picture needs a video episode.');
  await media.requestPictureInPicture();
}

async function ended() {
  if (!player.id || finished) return;
  finished = true;
  const id = player.id, gen = generation, position = Number.isFinite(media.duration) ? media.duration : media.currentTime;
  await flush();
  const saved = await patchEpisode(id, {played: true, playedAt: Date.now(), position});
  const state = await mutateAppState(s => ({...s, queue: s.queue.filter(x => x !== id), stats: {...s.stats, playedEpisodes: (Number(s.stats?.playedEpisodes) || 0) + 1}}));
  if (state.settings?.autoDeletePlayed && saved.audio && saved.audioUrl) await removeDownload(id);
  await reload();
  if (gen !== generation) return;
  if (player.sleep.end) { setSleep(0); return; }
  if (state.settings?.followQueue !== false) await next();
}

media.addEventListener('timeupdate', () => {
  const now = performance.now(), t = media.currentTime;
  if (!media.paused && !media.seeking) { const d = listeningDelta(lastMedia, t, (now - lastWall) / 1000, media.playbackRate); wallTotal += d.wall; mediaTotal += d.media; }
  lastMedia = t; lastWall = now;
  const {a, b} = player.loop;
  if (a !== null && b !== null && t >= b) { media.currentTime = a; return; }
  if (player.clarity.skip) { const gap = player.clarity.ranges.find(r => t >= r.start && t < r.end); if (gap) { media.currentTime = gap.end; return; } }
  const outro = Number(feedOf(current())?.skipOutro) || 0;
  if (!media.paused && !finished && outro > 0 && media.duration > outro && t >= media.duration - outro) { media.pause(); ended(); }
  if (player.sleep.deadline && Date.now() >= player.sleep.deadline) { media.pause(); setSleep(0); }
  if (now - lastFlush > 5000 && wallTotal > 0) flush();
  if ('mediaSession' in navigator && Number.isFinite(media.duration) && media.duration > 0) { try { navigator.mediaSession.setPositionState({duration: media.duration, playbackRate: media.playbackRate, position: Math.min(media.duration, t)}); } catch { /* ignored */ } }
  tick();
});
media.addEventListener('play', () => { finished = false; lastMedia = media.currentTime; lastWall = performance.now(); channel?.postMessage({type: 'playing', tabId}); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; emit(); });
media.addEventListener('pause', () => { flush(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; emit(); });
media.addEventListener('seeked', () => { lastMedia = media.currentTime; lastWall = performance.now(); tick(); });
media.addEventListener('ended', () => { ended(); });
media.addEventListener('durationchange', tick);
media.addEventListener('waiting', emit);
media.addEventListener('playing', emit);
media.addEventListener('error', () => {
  if (!media.getAttribute('src')) return;
  player.error = current()?.audio ? 'This browser cannot play this file format.' : 'This episode could not be streamed. Try downloading it.';
  emit();
});
setInterval(() => { if (player.sleep.deadline) emit(); }, 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('pagehide', () => { flush(); });
if ('mediaSession' in navigator) {
  const actions = {play: resume, pause: () => media.pause(), seekbackward: () => skipBy(-1), seekforward: () => skipBy(1), seekto: e => seek(e.seekTime), nexttrack: next, previoustrack: () => seek(0)};
  for (const [name, fn] of Object.entries(actions)) { try { navigator.mediaSession.setActionHandler(name, fn); } catch { /* Unsupported action. */ } }
}

import {transcribe, translate} from '../engines.js';
import {normalizeDocument} from '../core.js';
import {getEpisode, saveEpisode} from '../storage.js';
import {download, publisherTranscript} from './library.js';
import {put} from './store.js';
import {prefs, getKey} from './prefs.js';

/** Sequential background work: download → transcript → translation, one step at a time. */
export const jobs = [];
const listeners = new Set();
export const onJobs = fn => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => { for (const fn of listeners) fn(jobs); };
let running = null, blockedHandler = () => {};
export const setBlockedHandler = fn => { blockedHandler = fn; };

const LABELS = {download: 'Getting audio', publisher: 'Fetching transcript', asr: 'Transcribing', translate: 'Translating'};
export const jobLabel = job => LABELS[job.kind];
export const activeJob = episodeId => jobs.find(j => j.episodeId === episodeId && (j.status === 'running' || j.status === 'queued'));
export const failedJob = episodeId => jobs.findLast(j => j.episodeId === episodeId && (j.status === 'error' || (j.status === 'cancelled' && j.kind === 'translate' && j.resume?.translations?.length)));
export const busy = () => jobs.some(j => j.status === 'running' || j.status === 'queued');

/** steps: [{kind, config}] executed in order; a failure cancels the rest of the chain. */
export function enqueue(episodeId, title, steps) {
  const chain = crypto.randomUUID();
  for (const step of steps) jobs.push({id: crypto.randomUUID(), chain, episodeId, title, kind: step.kind, config: step.config, resume: step.resume, status: 'queued', progress: null, message: ''});
  while (jobs.length > 60) { const i = jobs.findIndex(j => !['running', 'queued'].includes(j.status)); if (i < 0) break; jobs.splice(i, 1); }
  emit();
  pump();
}

export function cancel(episodeId) {
  for (const job of jobs) if ((!episodeId || job.episodeId === episodeId) && job.status === 'queued') job.status = 'cancelled';
  if (running && (!episodeId || running.job.episodeId === episodeId)) running.controller.abort();
  emit();
}

export function retry(jobId) {
  const failed = jobs.find(j => j.id === jobId);
  if (!failed || !['error','cancelled'].includes(failed.status) || activeJob(failed.episodeId)) return;
  const rest = jobs.filter(j => j.chain === failed.chain && (j === failed || (j.status === 'cancelled' && jobs.indexOf(j) > jobs.indexOf(failed))));
  enqueue(failed.episodeId, failed.title, rest.map(({kind, config, resume}) => {
    if(!['asr','translate'].includes(kind))return {kind,config,resume};
    const scope=kind==='asr'?'asr':'translation',current=prefs[scope];
    // Retain the originally approved destination/model/languages, but allow a
    // corrected session key for that exact scope and same-model budget tuning.
    const budgets=current.provider===config.provider && current.endpoint===config.endpoint && current.model===config.model ? Object.fromEntries(['maxOutputTokens','batchCharacters','requestIntervalMs'].filter(k=>current[k]!==undefined).map(k=>[k,current[k]])) : {};
    return {kind,resume,config:{...config,...budgets,key:getKey(scope,config)}};
  }));
}
export const dismiss = jobId => { const i = jobs.findIndex(j => j.id === jobId); if (i >= 0 && !['running', 'queued'].includes(jobs[i].status)) jobs.splice(i, 1); emit(); };

function describe(p) {
  if (!p) return {};
  const pct = Number.isFinite(p.progress) ? Math.round(p.progress) : null;
  if (['initiate', 'download', 'progress', 'done'].includes(p.status) && p.file) return {message: 'Loading model', progress: pct};
  if (p.status === 'idle' || p.status === 'ready') return {};
  return {message: p.status ? String(p.status).replace(/^\w/, c => c.toUpperCase()) : '', progress: pct};
}

async function execute(job, signal) {
  const update = p => { Object.assign(job, describe(p)); emit(); };
  if (job.kind === 'download') {
    await download(job.episodeId, {signal, retry: job.config?.retry, onProgress: p => { job.progress = Number.isFinite(p.progress) ? Math.round(p.progress) : null; job.message = `${(p.loaded / 1048576).toFixed(1)} MB`; emit(); }});
    return;
  }
  if (job.kind === 'publisher') { await publisherTranscript(job.episodeId); return; }
  const episode = await getEpisode(job.episodeId);
  if (!episode) throw new Error('This episode was deleted.');
  const before = JSON.stringify(episode.doc ?? null);
  let doc;
  if (job.kind === 'asr') {
    if (!episode.audio) throw new Error('Get the audio before transcribing.');
    doc = await transcribe(episode.audio, job.config, {signal, onProgress: update});
  } else {
    if (!episode.doc) throw new Error('Create a transcript first.');
    doc = await translate(episode.doc, job.config, {signal, onProgress: update, resume: job.resume, onCheckpoint: checkpoint => { job.resume = checkpoint; }});
  }
  signal.throwIfAborted();
  const latest = await getEpisode(job.episodeId);
  if (!latest || JSON.stringify(latest.doc ?? null) !== before) throw new Error('The transcript changed while processing. Result not saved.');
  put(await saveEpisode({...latest, doc: normalizeDocument(doc)}));
}

async function pump() {
  if (running) return;
  const job = jobs.find(j => j.status === 'queued');
  if (!job) return;
  const controller = new AbortController();
  running = {job, controller};
  job.status = 'running'; job.message = ''; job.progress = null;
  emit();
  try {
    await execute(job, controller.signal);
    job.status = 'done';
  } catch (error) {
    job.status = controller.signal.aborted ? 'cancelled' : 'error';
    job.error = controller.signal.aborted ? 'Cancelled. Work already accepted by an online service may still be billed.' : error.message;
    job.code = error.code;
    for (const j of jobs) if (j.chain === job.chain && j.status === 'queued') j.status = 'cancelled';
    if (error.code === 'MEDIA_NETWORK_BLOCKED') blockedHandler(job.episodeId);
  } finally {
    running = null;
    emit();
    pump();
  }
}

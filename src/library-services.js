import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {authenticatedFetch} from './connections.js';
import {getEpisode,saveEpisode,episodeMetadataFields} from './storage.js';
import {normalizeDocument,parseTranscript} from './core.js';
export function safePodcastURL(value){
  const u=new URL(value);
  if(u.username||u.password||u.hash || (u.protocol!=='https:' && !(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw new Error('Use a secure HTTPS podcast URL without embedded credentials or a fragment.');
  return u.href;
}
export async function fetchMedia(url,{signal,maxMB=200,onProgress=()=>{},fetchFn=authenticatedFetch,proxy='',allowProxy=false}={}){
  const original=safePodcastURL(url);let target=original;
  if(proxy){if(!allowProxy||!proxy.includes('{url}'))throw new Error('A proxy requires explicit consent and a {url} placeholder.');target=safePodcastURL(proxy.replace('{url}',encodeURIComponent(original)));}
  if(!Number.isFinite(maxMB)||maxMB<1||maxMB>1000)throw new Error('Download budget must be 1–1000 MB.');
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason),timer=setTimeout(()=>controller.abort(new DOMException('Download timed out','TimeoutError')),900000);
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  try{
    controller.signal.throwIfAborted();
    let response;try{response=await fetchFn(target,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'follow'});}catch(error){if(controller.signal.aborted)throw controller.signal.reason;const failure=new Error('This recording could not be copied directly. Open audio help to save and attach it, or use a publisher transcript.');failure.code='MEDIA_NETWORK_BLOCKED';throw failure;}
    if(!response.ok)throw new Error(`Download failed (HTTP ${response.status}).`);
    if(response.url)safePodcastURL(response.url);
    const declared=Number(response.headers.get('Content-Length'))||0,limit=maxMB*1024*1024;
    if(declared>limit){await response.body?.cancel();throw new Error('Media exceeds your download budget.');}
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{while(true){controller.signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit)throw new Error('Media exceeds your download limit.');chunks.push(value);onProgress({loaded:total,total:declared,progress:declared?total/declared*100:undefined});}}
    catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
    return new Blob(chunks,{type:response.headers.get('Content-Type')?.split(';')[0]||'application/octet-stream'});
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
const allowedSettings=['skipBack','skipForward','defaultSpeed','followQueue','skipCompleted','autoDeletePlayed','enqueueDownloaded','autoDownload','autoDownloadLimit','refreshMinutes','maxDownloadMB','proxy','allowProxy','theme','includeExplicit','rememberPosition','country','queueLocked','queueKeepSorted','queueSort','enqueuePosition'];
const subscriptionFields=['id','url','title','description','author','image','link','language','explicit','tags','speed','skipIntro','skipOutro','autoDownload','createdAt','updatedAt','lastRefresh','lastError','titleOverride','keepUpdated','downloadInclude','downloadExclude','newEpisodeAction','newFeedUrl','nextPageUrl','funding'];
const pick=(obj,fields)=>Object.fromEntries(fields.filter(k=>Object.hasOwn(obj,k)).map(k=>[k,obj[k]]));
export const MAX_BACKUP_AUDIO_BYTES=512*1024*1024;
export const backupEntryByteLimit=name=>name==='library.json'?50*1024*1024:/^audio\/\d+\.bin$/.test(name)?MAX_BACKUP_AUDIO_BYTES:0;
const cleanState=state=>({queue:Array.isArray(state?.queue)?state.queue.filter(v=>typeof v==='string').slice(0,50000):[],settings:pick(state?.settings||{},allowedSettings),stats:pick(state?.stats||{},['listeningSeconds','totalMediaSeconds','playedEpisodes','daily']),downloadLog:Array.isArray(state?.downloadLog)?state.downloadLog.map(r=>pick(r,['episodeId','title','at','status','message'])).slice(-1000):[],lastEpisodeId:typeof state?.lastEpisodeId==='string'?state.lastEpisodeId:undefined});
export async function createBackup(data,includeAudio=false){
  const files={},episodes=[];let total=0;
  if(!Array.isArray(data.episodes)||data.episodes.length>50000)throw new Error('Too many episodes for a backup.');
  for(const [index,episode] of data.episodes.entries()){
    const copy=pick(episode,['id','title','createdAt','doc',...episodeMetadataFields]);
    if(includeAudio&&episode.audio instanceof Blob){total+=episode.audio.size;if(total>MAX_BACKUP_AUDIO_BYTES)throw new Error('Audio backup exceeds 512 MB. Export fewer downloads at a time.');copy.audioPath=`audio/${index}.bin`;copy.audioMime=episode.audio.type;files[copy.audioPath]=new Uint8Array(await episode.audio.arrayBuffer());}
    episodes.push(copy);
  }
  const manifest={format:'podlingua',version:1,exportedAt:new Date().toISOString(),includesAudio:includeAudio,episodes,subscriptions:(data.subscriptions||[]).map(s=>pick(s,subscriptionFields)),state:cleanState(data.state)};
  const metadata=strToU8(JSON.stringify(manifest));if(metadata.length>50*1024*1024)throw new Error('Backup metadata exceeds 50 MB.');files['library.json']=metadata;
  return new Blob([zipSync(files,{level:0})],{type:'application/zip'});
}
export async function parseBackup(file){
  if(file.size>600*1024*1024)throw new Error('Backup exceeds the 600 MB import limit.');
  let total=0;
  const input=new Uint8Array(await file.arrayBuffer());
  if(input[0]===123&&input.length>50*1024*1024)throw new Error('Backup metadata exceeds 50 MB.');
  const files=input[0]===123?{'library.json':input}:unzipSync(input,{filter:entry=>{
    const limit=backupEntryByteLimit(entry.name);if(!limit)return false;
    total+=entry.originalSize;if(total>570*1024*1024||entry.originalSize>limit)throw new Error('Backup expanded-size limit exceeded.');return true;
  }});
  if(!files['library.json'])throw new Error('This is not a Podlingua backup.');
  const data=JSON.parse(strFromU8(files['library.json']));
  if(data.format!=='podlingua'||data.version!==1||!Array.isArray(data.episodes)||data.episodes.length>50000||!Array.isArray(data.subscriptions)||data.subscriptions.length>10000)throw new Error('Unsupported or excessive backup data.');
  const ids=new Set();
  const episodes=data.episodes.map(ep=>{
    if(typeof ep.id!=='string'||!ep.id||ep.id.length>128||ids.has(ep.id)||typeof ep.title!=='string')throw new Error('Invalid/duplicate backup episode.');ids.add(ep.id);
    const result=pick(ep,['id','title','createdAt',...episodeMetadataFields]);
    if(result.audioUrl)safePodcastURL(result.audioUrl);if(ep.doc)result.doc=normalizeDocument(ep.doc);
    if(ep.audioPath){if(!/^audio\/\d+\.bin$/.test(ep.audioPath)||!files[ep.audioPath])throw new Error('Missing backup audio.');result.audio=new Blob([files[ep.audioPath]],{type:ep.audioMime||'application/octet-stream'});}
    return result;
  });
  const subscriptions=data.subscriptions.map(s=>{safePodcastURL(s.url);return pick(s,subscriptionFields);});
  const state=cleanState(data.state);
  // Backup contents are data, not authority to contact a proxy or enable automation.
  delete state.settings.proxy;state.settings.allowProxy=false;state.settings.autoDownload=false;state.settings.refreshMinutes=0;
  return {episodes,subscriptions,state};
}
export async function patchEpisode(id,patch){
  for(let attempt=0;attempt<3;attempt++){
    const current=await getEpisode(id);if(!current)throw new Error('Episode was deleted.');
    try{const values=typeof patch==='function'?patch(current):patch;if(values===null)return current;return await saveEpisode({...current,...values,id:current.id,revision:current.revision});}catch(error){if(!error.message.includes('changed or was deleted')||attempt===2)throw error;}
  }
}
export async function downloadEpisode(id,{signal,onProgress}={}){
  const before=await getEpisode(id);if(!before)throw new Error('Episode was deleted.');if(before.audio)return before;if(!before.audioUrl)throw new Error('This episode has no downloadable media URL.');
  const catalog=await import('./catalog.js');const state=await catalog.getAppState();
  try{
    const audio=await fetchMedia(before.audioUrl,{signal,onProgress,maxMB:Number(state.settings?.maxDownloadMB)||100,proxy:state.settings?.proxy,allowProxy:state.settings?.allowProxy});
    const after=await getEpisode(id);if(!after||after.audioUrl!==before.audioUrl)throw new Error('Episode was deleted or its media URL changed during download.');
    const saved=await saveEpisode({...after,audio,downloadedAt:Date.now()});
    const {reduceQueue}=await import('./parity.js'),rows=await (await import('./storage.js')).listEpisodes();await catalog.mutateAppState(fresh=>({...fresh,downloadLog:[...(fresh.downloadLog||[]),{episodeId:id,title:saved.title,at:Date.now(),status:'complete'}].slice(-1000),...(fresh.settings?.enqueueDownloaded?{queue:reduceQueue(fresh,{type:'add',ids:[id],automatic:true,currentId:fresh.lastEpisodeId},rows)}:{})}));
    window.dispatchEvent(new Event('podlingua:library'));return saved;
  }catch(error){
    const fresh=await catalog.getAppState();await catalog.setAppState({downloadLog:[...(fresh.downloadLog||[]),{episodeId:id,title:before.title,at:Date.now(),status:'failed',message:error.name==='AbortError'?'Cancelled':error.message}].slice(-1000)});throw error;
  }
}
export async function removeDownload(id){const saved=await patchEpisode(id,{audio:undefined,downloadedAt:undefined});window.dispatchEvent(new Event('podlingua:library'));return saved;}
export async function publisherTranscript(id,options={}){
  const episode=await getEpisode(id);if(!episode)throw new Error('Episode was deleted.');
  const candidates=episode.transcripts||[],entry=candidates.find(t=>/json|vtt|srt/i.test(t.type))||candidates.find(t=>/\.(json|vtt|srt)(?:\?|$)/i.test(t.url));
  if(!entry)throw new Error('This publisher did not advertise a supported JSON, SRT or VTT transcript. You can still import a transcript manually.');
  const blob=await fetchMedia(entry.url,{...options,maxMB:10});
  const filename=/json/i.test(entry.type)?'publisher.json':/vtt/i.test(entry.type)?'publisher.vtt':/srt|subrip/i.test(entry.type)?'publisher.srt':new URL(entry.url).pathname;
  const doc=parseTranscript(await blob.text(),filename);doc.provider='publisher';if(doc.language==='auto')doc.language=entry.language || options.language || 'auto';
  const fresh=await getEpisode(id);if(!fresh||JSON.stringify(fresh.doc)!==JSON.stringify(episode.doc))throw new Error('Transcript changed while importing its publisher transcript. Please retry explicitly.');
  const saved=await saveEpisode({...fresh,doc});window.dispatchEvent(new Event('podlingua:library'));return saved;
}

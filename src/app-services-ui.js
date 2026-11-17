import {createBackup,parseBackup,fetchMedia,downloadEpisode,removeDownload,publisherTranscript} from './library-services.js';
import {getEpisode,saveEpisode,listEpisodes} from './storage.js';
import {parseID3Chapters} from './media-tags.js';
import {initAudioRecovery} from './audio-recovery.js';
export function initAppServices(bridge){
 const audioRecovery=initAudioRecovery(bridge),blockedAudio=new Map();
 const backup=document.createElement('dialog');backup.id='backup-dialog';
 // Static trusted interface markup; user/feed strings are only assigned with textContent.
 backup.innerHTML='<h2>Portable library backup</h2><p>Includes subscriptions, episode state, bookmarks and transcripts. Private feed URLs may be present: keep the file private. Provider keys are not exported. Restore disables automatic network requests and proxy access until you authorize them again.</p><label><input id="backup-audio" type="checkbox"> Include downloaded audio (up to 512 MB; may need substantial RAM)</label><div><button id="backup-create" type="button">Export backup ZIP</button><button id="backup-close" type="button">Close</button></div><p id="backup-progress" aria-live="polite"></p>';document.body.append(backup);
 document.getElementById('backup-close').onclick=()=>backup.close();
 document.getElementById('backup-create').onclick=async()=>{
  const button=document.getElementById('backup-create');button.disabled=true;
  try{document.getElementById('backup-progress').textContent='Preparing portable library…';const db=await import('./catalog.js'),data={episodes:await listEpisodes(),subscriptions:await db.listSubscriptions(),state:await db.getAppState()};const blob=await createBackup(data,document.getElementById('backup-audio').checked),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`podlingua-backup-${new Date().toISOString().slice(0,10)}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);document.getElementById('backup-progress').textContent='Backup exported. Store it securely.';}
  catch(error){document.getElementById('backup-progress').textContent=error.message;}finally{button.disabled=false;}
 };
 return {
  exportBackup(){backup.showModal();},
  async importBackup(file){
   if(!confirm('Restore this Podlingua backup? Matching entries will be updated; unrelated entries are retained. Downloads may consume substantial storage.'))return;
   const data=await parseBackup(file),db=await import('./catalog.js');
   for(const feed of data.subscriptions)await db.saveSubscription(feed);
   for(const episode of data.episodes){const existing=await getEpisode(episode.id);await saveEpisode({...existing,...episode,...(existing?{revision:existing.revision}:{})});}
   await db.setAppState(data.state);await bridge.refresh();window.dispatchEvent(new Event('podlingua:library'));bridge.status(`Restored ${data.episodes.length} episodes and ${data.subscriptions.length} subscriptions. Automatic requests and proxy access are off; authorize them again in settings if wanted.`);
  },
  async showAudioHelp(id){return audioRecovery.show(id);},
  async downloadEpisode(id,opts={}){const episode=await getEpisode(id);if(episode&&!episode.audio&&blockedAudio.has(id)&&blockedAudio.get(id)===episode.audioUrl&&!opts.retry){if(!opts.background)await audioRecovery.show(id);const error=new Error('Audio needs your help. Save the recording from the publisher and attach it to this episode.');error.code='MEDIA_NETWORK_BLOCKED';throw error;}try{const saved=await downloadEpisode(id,opts);blockedAudio.delete(id);bridge.onSaved?.(saved);await bridge.refresh();return saved;}catch(error){if(error.code==='MEDIA_NETWORK_BLOCKED'){blockedAudio.set(id,episode?.audioUrl);if(!opts.background)await audioRecovery.show(id);}throw error;}},
  async removeDownload(id){const saved=await removeDownload(id);bridge.onSaved?.(saved);await bridge.refresh();return saved;},
  async publisherTranscript(id){
   const db=await import('./catalog.js'),state=await db.getAppState();const saved=await publisherTranscript(id,{proxy:state.settings?.proxy,allowProxy:state.settings?.allowProxy});await bridge.openEpisode(id);bridge.status('Publisher transcript imported without speech recognition or audio upload.');return saved;
  },
  async loadChapters(id){
   const episode=await getEpisode(id);if(!episode)throw new Error('Episode was deleted.');if(episode.chapters?.length)return episode;
   if(!episode.chaptersUrl){if(!episode.audio)return episode;const chapters=parseID3Chapters(await episode.audio.slice(0,16*1024*1024+10).arrayBuffer());if(!chapters.length)return episode;const fresh=await getEpisode(id);if(!fresh)throw new Error('Episode was deleted.');const saved=await saveEpisode({...fresh,chapters});bridge.onSaved?.(saved);return saved;}
   const db=await import('./catalog.js'),{parseChapters}=await import('./podcasts.js'),state=await db.getAppState();
   const blob=await fetchMedia(episode.chaptersUrl,{maxMB:5,proxy:state.settings?.proxy,allowProxy:state.settings?.allowProxy});
   const fresh=await getEpisode(id);if(!fresh)throw new Error('Episode was deleted.');const saved=await saveEpisode({...fresh,chapters:parseChapters(JSON.parse(await blob.text()))});bridge.onSaved?.(saved);return saved;
  },
 };
}

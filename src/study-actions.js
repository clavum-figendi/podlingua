import './study-actions.css';

const languages=[['auto','Detect automatically'],['en','English'],['fr','French'],['de','German'],['es','Spanish'],['it','Italian'],['pt','Portuguese'],['ar','Arabic'],['zh','Chinese'],['ja','Japanese'],['ko','Korean'],['nl','Dutch'],['ru','Russian'],['hi','Hindi'],['tr','Turkish'],['uk','Ukrainian']];

/** Beginner entry point. Engine configuration and job preflight remain owned by app.js.
 * open(kind, episodeId?) selects a podcast episode through the bridge before showing it.
 * startTranscription(id) / startTranslation(id) must return the real job Promise and
 * recheck the selected id in the parent immediately before starting a request.
 */
export function initStudyActions(bridge){
 const existing=document.querySelector('#study-actions');
 if(existing)return existing.studyAPI;
 const transcript=document.querySelector('#transcript');
 if(!transcript)return;
 const $=id=>document.getElementById(id);
 const bar=document.createElement('section');bar.id='study-actions';bar.setAttribute('aria-label','Study actions');
 // Both innerHTML assignments contain authored static markup only. Episode and
 // provider values below always enter the DOM through textContent / Option.
 bar.innerHTML='<div class="study-action-heading"><strong>Study this episode</strong><span id="study-stage">Choose an episode or import audio to begin.</span></div><div class="study-action-buttons"><button type="button" id="study-create">Create transcript</button><button type="button" id="study-translate">Translate</button></div><div class="study-job"><span id="study-job-status" role="status"></span><progress id="study-job-progress" aria-label="Study job progress" max="100" hidden></progress><button type="button" id="study-cancel" hidden>Cancel processing</button></div>';
 transcript.before(bar);
 const dialog=document.createElement('dialog');dialog.id='study-action-dialog';dialog.setAttribute('aria-labelledby','study-dialog-title');
 dialog.innerHTML='<div class="study-dialog-top"><h2 id="study-dialog-title">Create transcript</h2><button type="button" id="study-close" aria-label="Close study guide">×</button></div><p id="study-episode"></p><p id="study-availability"></p><div class="study-language-grid"><label>Language spoken in the episode<select id="study-source" aria-label="Language spoken in the episode"></select></label><label id="study-target-label">Translate into<select id="study-target" aria-label="Translate into"></select></label></div><section class="study-processing"><h3>Where it runs</h3><p id="study-processing-mode"></p><p id="study-engine"></p><p id="study-privacy"></p><label id="study-permission-label"><input type="checkbox" id="study-permission"><span id="study-permission-text"></span></label><p id="study-readiness"></p></section><p id="study-message" role="status"></p><div class="study-dialog-actions"><button type="button" id="study-get-audio">Get audio for this episode</button><button type="button" id="study-import-audio">Import audio</button><button type="button" id="study-need-transcript">Create transcript first</button><button type="button" id="study-advanced">Open advanced settings</button><button type="button" id="study-start">Start transcription</button></div>';
 document.body.append(dialog);
 const modelLabel=document.createElement('label');modelLabel.textContent='On-device model';const modelSelect=document.createElement('select');modelSelect.setAttribute('aria-label','On-device model');modelLabel.append(modelSelect);dialog.querySelector('.study-processing').append(modelLabel);
 modelSelect.onchange=()=>{const field=$(kind+'-model');if(field){field.value=modelSelect.value;field.dispatchEvent(new Event('change',{bubbles:true}));}render();};
 const publisherButton=document.createElement('button');publisherButton.type='button';publisherButton.textContent='Use publisher transcript';dialog.querySelector('.study-dialog-actions').prepend(publisherButton);
 publisherButton.onclick=async()=>{if(busy)return;const id=boundId;busy=true;render();try{if((await bridge.currentEpisode())?.id!==id)throw new Error('Selection changed. Choose the episode again.');await bridge.publisherTranscript(id);await refresh();$('study-message').textContent='Publisher transcript ready. No speech-recognition model or audio upload was needed.';}catch(error){report(error.message);}finally{busy=false;render();}};
 const dialogJob=document.createElement('div');dialogJob.className='study-job';
 const dialogStatus=document.createElement('span');dialogStatus.setAttribute('role','status');
 const dialogProgress=document.createElement('progress');dialogProgress.setAttribute('aria-label','Processing progress');dialogProgress.hidden=true;
 const dialogCancel=document.createElement('button');dialogCancel.type='button';dialogCancel.textContent='Cancel processing';dialogCancel.hidden=true;dialogCancel.onclick=()=>$('cancel')?.click();
 dialogJob.append(dialogStatus,dialogProgress,dialogCancel);$('study-message').after(dialogJob);
 const scroll=document.createElement('div');scroll.className='study-dialog-content';const actions=dialog.querySelector('.study-dialog-actions');for(const node of [...dialog.children])if(!node.classList.contains('study-dialog-top')&&node!==actions)scroll.append(node);actions.before(scroll);
 let kind='asr',boundId,episode,opening=false,busy=false,disposed=false,refreshVersion=0,returnFocus;
 for(const id of ['study-source','study-target'])for(const [value,label] of languages){if(id==='study-target'&&value==='auto')continue;$(id).add(new Option(label,value));}
 function mirrorLanguage(name){const control=$('study-'+name);let value=$(name)?.value|| (name==='source'?'auto':'fr');if(name==='source'&&kind==='translation'&&value==='auto'&&episode?.doc?.language&&!['unknown','und','auto'].includes(episode.doc.language))value=episode.doc.language;if(![...control.options].some(o=>o.value===value))control.add(new Option(value,value));control.value=value;}
 function report(message){$('study-message').textContent=message;bridge.status?.(message,true);}
 function jobActive(){return Boolean($('cancel')&&!$('cancel').hidden);}
 function mirrorJob(){
  const status=$('status'),progress=$('progress');$('study-job-status').textContent=status?.textContent||'';
  $('study-job-progress').hidden=!progress||progress.hidden;
  if(progress){$('study-job-progress').max=progress.max;if(progress.hasAttribute('value'))$('study-job-progress').value=progress.value;else $('study-job-progress').removeAttribute('value');}
  $('study-cancel').hidden=!jobActive();
  dialogStatus.textContent=status?.textContent||'';dialogProgress.hidden=!progress||progress.hidden;dialogCancel.hidden=!jobActive();
  if(progress){dialogProgress.max=progress.max;if(progress.hasAttribute('value'))dialogProgress.value=progress.value;else dialogProgress.removeAttribute('value');}
 }
 function render(){
  $('study-stage').textContent=episode?`${episode.title||'Untitled episode'} · ${episode.doc?'Transcript ready — translate next':episode.audio?'Audio ready — create a transcript':episode.audioUrl?'Get audio, then create a transcript':'Add audio or import a transcript'}`:'Choose an episode or import audio to begin.';
  if(!dialog.open)return;
  const stale=episode?.id!==boundId;
  const provider=$(kind+'-provider'),local=provider?.value==='local',offline=$('offline-models-only')?.checked===true;
  $('study-start').textContent=kind==='asr'?'Start transcription':provider?.value==='google'?'Translate with Google':'Start translation';
  modelLabel.hidden=!local;modelSelect.replaceChildren();for(const option of $('download-model')?.options||[]){if(option.dataset.kind===kind)modelSelect.add(new Option(option.textContent,option.value));}const chosen=$(kind+'-model')?.value;if(chosen&&![...modelSelect.options].some(o=>o.value===chosen))modelSelect.add(new Option(chosen,chosen));modelSelect.value=chosen||'';modelSelect.disabled=busy||jobActive();
  publisherButton.hidden=kind!=='asr'||!episode?.transcripts?.length||stale;publisherButton.disabled=busy;
  const permission=$(local?'download-consent':'cloud-consent');
  const missingAudio=kind==='asr'&&!episode?.audio,missingTranscript=kind==='translation'&&!episode?.doc;
  $('study-availability').textContent=stale?'Selection changed. Close this guide and choose an action for the new episode.':`${episode?.audio?'Audio saved on this device':episode?.audioUrl?'Audio can stream, but must be saved before transcription':'No audio attached'} · ${episode?.doc?'Transcript available':'No transcript yet'}.`;
  $('study-processing-mode').textContent=local?'On this device':'Online service / configured endpoint';
  $('study-engine').textContent=`Current settings: ${provider?.selectedOptions[0]?.textContent||'No provider selected'}. Your advanced settings are preserved.`;
  $('study-privacy').textContent=local?(offline?'Uses downloaded models only. Audio and text stay in this browser. Cached model availability is checked when you start.':'Audio and text stay in this browser. The selected model may need a download from its model host, potentially hundreds of MB. Processing can be slow.'):`${kind==='asr'?'Audio':'Transcript text'} is sent to the currently configured service${$(kind+'-endpoint')?.value?' at '+$(kind+'-endpoint').value:''}. Provider charges, retention rules and quotas apply. No automatic provider switching.`;
  $('study-permission-label').hidden=local&&offline;
  $('study-permission').checked=permission?.checked===true;
  $('study-permission-text').textContent=local?'I allow local model downloads from model hosts (potentially hundreds of MB).':'I allow audio/text transfer to my selected endpoint. Charges may apply.';
  const consentReady=local&&offline||permission?.checked===true;
  const needsKey=!local&&!['custom','ollama','mymemory','libretranslate'].includes(provider?.value)&&!$(kind+'-key')?.value;
  const invalidSource=kind==='translation'&&local&&$('study-source').value==='auto';
  const missingModel=local&&!$(kind+'-model')?.value.trim();
  const reasons=[];
  if(!episode)reasons.push('Choose an episode or import audio first.');
  if(missingAudio)reasons.push(episode?.audioUrl?'Get audio for this episode before starting.':'Import audio to create a transcript.');
  if(missingTranscript)reasons.push('Create or import a transcript before translating.');
  if(!consentReady)reasons.push(local?'Local model download consent is required. Review the permission above, or use downloaded models only in advanced settings.':'Transfer consent is required. Review the permission above.');
  if(needsKey)reasons.push('Add your service API key in advanced settings.');
  if(missingModel)reasons.push('Choose a local model in advanced settings.');
  if(invalidSource)reasons.push('Choose the language spoken in the episode for on-device translation.');
  if(kind==='asr'&&episode?.doc)reasons.push('Creating a new transcript replaces its existing transcript and translations.');
  $('study-readiness').textContent=reasons.join(' ')||'Settings ready for the initial checks. Model files, language support and service availability are checked when you start.';
  $('study-get-audio').hidden=!missingAudio||!episode?.audioUrl||stale;
  $('study-import-audio').hidden=!missingAudio||Boolean(episode?.audioUrl)||stale;
  $('study-need-transcript').hidden=!missingTranscript||stale;
  $('study-start').disabled=busy||stale||!episode||missingAudio||missingTranscript||!consentReady||needsKey||missingModel||invalidSource||jobActive();
  $('study-get-audio').disabled=busy;
  mirrorJob();
 }
 async function refresh(){const version=++refreshVersion;try{const selected=await bridge.currentEpisode();if(disposed||version!==refreshVersion)return;episode=selected;render();}catch(error){if(!disposed)report(error.message);}}
 async function open(nextKind='asr',episodeId){
  if(opening||busy)return;opening=true;
  try{
   if(episodeId)await bridge.openEpisode(episodeId);
   const selected=await bridge.currentEpisode();if(disposed)return;
   if(episodeId&&selected?.id!==episodeId)throw new Error('Selection changed. Choose the episode again before studying it.');
   episode=selected;boundId=selected?.id;kind=['translation','translate'].includes(nextKind)?'translation':'asr';
   returnFocus=document.activeElement;
   $('study-episode').textContent=selected?.title||'No episode selected';
   $('study-dialog-title').textContent=kind==='asr'?'Create transcript':'Translate';
   $('study-start').textContent=kind==='asr'?'Start transcription':'Start translation';
   $('study-target-label').hidden=kind==='asr';$('study-message').textContent='';mirrorLanguage('source');mirrorLanguage('target');
   if(!dialog.open)dialog.showModal();render();
  }catch(error){bridge.status?.(error.message,true);}finally{opening=false;}
 }
 $('study-create').onclick=()=>open('asr');$('study-translate').onclick=()=>open('translation');
 $('study-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>returnFocus?.isConnected&&returnFocus.focus());
 $('study-cancel').onclick=()=>$('cancel')?.click();
 $('study-advanced').onclick=()=>{dialog.close();$('settings')?.showModal();};
 $('study-import-audio').onclick=()=>{dialog.close();$('audio-import')?.click();};
 $('study-need-transcript').onclick=()=>open('asr');
 for(const name of ['source','target'])$('study-'+name).onchange=()=>{if($(name)){$(name).value=$('study-'+name).value;$(name).dispatchEvent(new Event('change',{bubbles:true}));}render();};
 $('study-permission').onchange=()=>{const local=$(kind+'-provider')?.value==='local',control=$(local?'download-consent':'cloud-consent');if(control){control.checked=$('study-permission').checked;control.dispatchEvent(new Event('change',{bubbles:true}));}render();};
 async function act(download=false){
  if(busy)return;busy=true;const id=boundId;render();
  try{
   const selected=await bridge.currentEpisode();
   if(!id||selected?.id!==id)throw new Error('Selection changed. Close this guide and choose an action for the new episode.');
   if(download){await bridge.downloadEpisode(id);await refresh();return;}
   if(kind==='asr'&&!selected.audio)throw new Error('Get audio for this episode before starting.');
   if(kind==='translation'&&!selected.doc)throw new Error('Create or import a transcript before translating.');
   const callback=kind==='asr'?bridge.startTranscription:bridge.startTranslation;
   if(!callback)throw new Error('Processing is unavailable. Please reload the app.');
   $('study-message').textContent='Starting…';
   // Parent owns the authoritative preflight and actual job; never click the old
   // guarded buttons, whose handlers cannot return their job promises.
   const result=await callback.call(bridge,id);
   $('study-message').textContent=result?.cancelled?'Processing was not completed. No result was substituted.':result?.completed===0?'No episode was processed. Check the job status below.':'Processing finished. Close this guide to read the result.';
   await refresh();
  }catch(error){report(error.message||String(error));}finally{busy=false;if(!disposed)render();}
 }
 $('study-get-audio').onclick=()=>act(true);$('study-start').onclick=()=>act();
 const settingsChange=()=>{mirrorLanguage('source');mirrorLanguage('target');render();};
 $('settings')?.addEventListener('change',settingsChange);$('settings')?.addEventListener('close',settingsChange);
 const observer=new MutationObserver(mirrorJob);
 for(const id of ['status','progress','cancel'])if($(id))observer.observe($(id),{childList:true,subtree:true,attributes:true,characterData:true});
 const readerChange=()=>refresh();
 window.addEventListener('podlingua:reader',readerChange);window.addEventListener('podlingua:library',readerChange);
 const externalOpen=event=>open(event.detail?.kind,event.detail?.episodeId);
 window.addEventListener('podlingua:study',externalOpen);
 const api={open,refresh,destroy(){disposed=true;observer.disconnect();window.removeEventListener('podlingua:reader',readerChange);window.removeEventListener('podlingua:library',readerChange);window.removeEventListener('podlingua:study',externalOpen);$('settings')?.removeEventListener('change',settingsChange);$('settings')?.removeEventListener('close',settingsChange);dialog.remove();bar.remove();}};
 bar.studyAPI=api;refresh();mirrorJob();return api;
}

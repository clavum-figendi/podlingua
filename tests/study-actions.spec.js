import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function setup(page,episode={id:'one',title:'Morning episode',audio:true}){
 // Isolated component fixtures: explicitly serve source; production integration is tested separately.
 const source=await readFile(new URL('../src/study-actions.js',import.meta.url),'utf8');
 await page.route('**/podlingua/src/study-actions.js',r=>r.fulfill({contentType:'text/javascript',body:source.replace("import './study-actions.css';",'')}));
 await page.goto('/podlingua/');
 await page.setContent(`<main><section class="reader-panel"><div id="transcript">Words appear here</div></section></main><button id="transcribe">Original transcript action</button><button id="translate">Original translation action</button><span id="status">Ready</span><progress id="progress" max="100" hidden></progress><button id="cancel" hidden>Cancel</button><dialog id="settings"><button id="settings-close">Close</button><select id="asr-provider"><option value="local">Local Whisper</option><option value="groq">Groq</option></select><select id="translation-provider"><option value="local">Local translation</option><option value="groq">Groq</option></select><input id="asr-model" value="Xenova/whisper-tiny"><input id="translation-model" value="Xenova/opus-mt-en-fr"><input id="asr-endpoint"><input id="translation-endpoint"><input id="asr-key"><input id="translation-key"><input id="source" value="en"><input id="target" value="fr"><input id="download-consent" type="checkbox"><input id="cloud-consent" type="checkbox"><input id="offline-models-only" type="checkbox"></dialog>`);
 await page.addStyleTag({content:await readFile(new URL('../src/study-actions.css',import.meta.url),'utf8')});
 await page.evaluate(async episode=>{
  window.episode=episode;window.calls=[];
  const bridge={currentEpisode:async()=>window.episode,openEpisode:async id=>{window.calls.push(['open',id]);window.episode={id,title:'Podcast episode',audioUrl:'https://example.org/audio.mp3'};},downloadEpisode:async id=>{window.calls.push(['download',id]);if(window.downloadError)throw Error(window.downloadError);window.episode.audio=true;},status:message=>document.querySelector('#status').textContent=message,startTranscription:async(...args)=>{window.calls.push(['asr',...args]);if(window.jobError)throw Error(window.jobError);if(window.holdJob)await new Promise(resolve=>window.finishJob=resolve);},startTranslation:async(...args)=>window.calls.push(['translation',...args])};
  document.querySelector('#cancel').onclick=()=>{window.calls.push(['cancel']);document.querySelector('#cancel').hidden=true;};
  document.querySelector('#settings-close').onclick=()=>document.querySelector('#settings').close();
  const {initStudyActions}=await import('/podlingua/src/study-actions.js');window.study=initStudyActions(bridge);
 },episode);
}

test('reader exposes compact actions and explains missing model consent without changing it',async({page})=>{
 await setup(page);
 await expect(page.getByRole('button',{name:'Create transcript',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Translate',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create transcript',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Create transcript'});
 await expect(dialog).toContainText('Morning episode');
 await expect(dialog).toContainText('Audio saved on this device');
 await expect(dialog).toContainText('model download consent');
 await expect(page.locator('#download-consent')).not.toBeChecked();
 await expect(page.locator('#cloud-consent')).not.toBeChecked();
 await expect(dialog.getByRole('button',{name:'Start transcription'})).toBeDisabled();
 await dialog.getByRole('button',{name:'Open advanced settings'}).click();
 await expect(page.locator('#settings')).toBeVisible();
 await expect(page.locator('#transcribe')).toHaveText('Original transcript action');
 await expect(page.locator('#translate')).toHaveText('Original translation action');
});

test('explicit permission starts exactly one captured episode job and mirrors cancellable progress inside the guide',async({page})=>{
 await setup(page);
 await page.evaluate(()=>window.holdJob=true);
 await page.locator('#study-create').click();
 await page.locator('#study-permission').check();
 await expect(page.locator('#download-consent')).toBeChecked();
 await page.locator('#study-start').dblclick({force:true});
 await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c[0]==='asr'))).toEqual([['asr','one']]);
 await page.evaluate(()=>{document.querySelector('#status').textContent='Downloading model · 43%';const p=document.querySelector('#progress');p.hidden=false;p.value=43;document.querySelector('#cancel').hidden=false;});
 const dialog=page.getByRole('dialog',{name:'Create transcript'});
 await expect(dialog.getByRole('progressbar')).toHaveAttribute('value','43');
 await expect(dialog).toContainText('Downloading model · 43%');
 await dialog.getByRole('button',{name:'Cancel processing'}).click();
 await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c[0]==='cancel').length)).toBe(1);
 await page.evaluate(()=>window.finishJob());
});

test('podcast hook gets the captured audio and exposes download errors without starting a job',async({page})=>{
 await setup(page);
 await page.evaluate(()=>window.study.open('asr','podcast-two'));
 await expect(page.locator('#study-episode')).toHaveText('Podcast episode');
 await expect(page.locator('#study-get-audio')).toBeVisible();
 await page.evaluate(()=>window.downloadError='Browser blocked this audio. Attach a local copy.');
 await page.locator('#study-get-audio').click();
 await expect(page.locator('#study-message')).toContainText('Browser blocked this audio');
 await expect.poll(()=>page.evaluate(()=>window.calls)).toEqual([['open','podcast-two'],['download','podcast-two']]);
 await page.evaluate(()=>window.downloadError='');
 await page.locator('#study-get-audio').click();
 await expect(page.locator('#study-availability')).toContainText('Audio saved');
 await expect(page.locator('#study-get-audio')).toBeHidden();
});

test('selection changes cannot launch a detached episode action',async({page})=>{
 await setup(page);
 await page.locator('#study-create').click();await page.locator('#study-permission').check();
 // Deliberately omit a reader event to test the authoritative recheck at start.
 await page.evaluate(()=>window.episode={id:'other',title:'Other',audio:true});
 await page.locator('#study-start').click();
 await expect(page.locator('#study-message')).toContainText('Selection changed');
 await expect.poll(()=>page.evaluate(()=>window.calls)).toEqual([]);
 await page.evaluate(()=>window.dispatchEvent(new Event('podlingua:reader')));
 await expect(page.locator('#study-availability')).toContainText('Selection changed');
 await expect(page.locator('#study-start')).toBeDisabled();
});

test('translation guides missing transcript and retains hosted provider settings without granting consent',async({page})=>{
 await setup(page);
 await page.locator('#study-translate').click();
 await expect(page.locator('#study-need-transcript')).toBeVisible();
 await expect(page.locator('#study-start')).toBeDisabled();
 await page.locator('#study-close').click();
 await page.evaluate(()=>{window.episode.doc={language:'en',segments:[{text:'Hello'}]};document.querySelector('#translation-provider').value='groq';document.querySelector('#translation-model').value='chosen-model';document.querySelector('#translation-endpoint').value='https://example.org/custom';document.querySelector('#translation-key').value='test-fixture';});
 await page.locator('#study-translate').click();
 await expect(page.locator('#study-processing-mode')).toContainText('Online service');
 await expect(page.locator('#study-engine')).toContainText('advanced settings are preserved');
 await expect(page.locator('#study-privacy')).toContainText('https://example.org/custom');
 await expect(page.locator('#cloud-consent')).not.toBeChecked();
 await expect(page.locator('#study-start')).toBeDisabled();
 await page.locator('#study-permission').check();
 await page.getByLabel('Translate into',{exact:true}).selectOption('de');
 await expect(page.locator('#target')).toHaveValue('de');
 await page.locator('#study-start').click();
 await expect.poll(()=>page.evaluate(()=>window.calls)).toEqual([['translation','one']]);
 await expect(page.locator('#translation-provider')).toHaveValue('groq');
 await expect(page.locator('#translation-model')).toHaveValue('chosen-model');
});

test('offline-only processing does not grant download consent and actionable job errors remain visible',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{document.querySelector('#offline-models-only').checked=true;window.jobError='Model is not downloaded. Open the model library to download or verify it.';});
 await page.locator('#study-create').click();
 await expect(page.locator('#study-permission-label')).toBeHidden();
 await expect(page.locator('#study-start')).toBeEnabled();
 await expect(page.locator('#study-privacy')).toContainText('downloaded models only');
 await page.locator('#study-start').click();
 await expect(page.locator('#study-message')).toContainText('Model is not downloaded');
 await expect(page.locator('#study-job-status')).toContainText('Open the model library');
 await expect(page.locator('#download-consent')).not.toBeChecked();
});

test('opening a podcast that loses selection does not bind a different episode',async({page})=>{
 await setup(page);
 await page.evaluate(async()=>{
  // Opening a podcast may race another navigation while storage is being read.
  window.episode={id:'other',title:'Other episode',audio:true};
  window.raceStudy=window.study;
  window.study.destroy();
  const {initStudyActions}=await import('/podlingua/src/study-actions.js');
  window.study=initStudyActions({currentEpisode:async()=>window.episode,openEpisode:async()=>{},status:message=>document.querySelector('#status').textContent=message});
  await window.study.open('asr','intended');
 });
 await expect(page.locator('#status')).toContainText('Selection changed');
 await expect(page.locator('#study-action-dialog')).not.toBeVisible();
});

test('mobile controls have 44px targets and fit without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:375,height:812});await setup(page);
 for(const id of ['study-create','study-translate']){
  const box=await page.locator('#'+id).boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x+box.width).toBeLessThanOrEqual(375);
 }
 await page.locator('#study-create').click();
 const box=await page.locator('#study-action-dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(375);
 const start=await page.locator('#study-start').boundingBox();expect(start.y).toBeGreaterThanOrEqual(0);expect(start.y+start.height).toBeLessThanOrEqual(812);
});

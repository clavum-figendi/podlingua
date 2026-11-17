import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ baseURL: 'http://127.0.0.1:4173/podlingua/' });
const transcript = { language: 'en', targetLanguage: 'fr', provider: 'import', segments: [{ start: 0, end: 2, text: 'Learning begins with listening.', translation: 'Apprendre commence par écouter.', speaker: 'Ada', words: [{ start: 0, end: .6, text: 'Learning' }, { start: .6, end: 1, text: 'begins' }, { start: 1, end: 1.4, text: 'with' }, { start: 1.4, end: 2, text: 'listening.' }] }, { start: 3, end: 5, text: 'A second perspective.', translation: 'Une autre perspective.' }] };
async function importDoc(page) {
  await page.goto('/podlingua/');
  await page.getByLabel('Import transcript').setInputFiles({ name: 'Listening.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(transcript)) });
  await expect(page.getByRole('heading', { name: 'Listening', exact: true })).toBeVisible();
}

test('imports paired transcript, filters and exports real data, persists library', async ({ page }) => {
  await importDoc(page);
  await expect(page.getByText('Apprendre commence par écouter.', { exact: false })).toBeVisible();
  await page.getByLabel('Search transcript').fill('perspective');
  await expect(page.locator('.segment:visible')).toHaveCount(1);
  await page.getByLabel('Search transcript').fill('');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export transcript' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Listening.json');
  expect(JSON.parse(await readFile(await file.path(),'utf8'))).toEqual(transcript);
  await page.reload();
  await page.getByRole('button', { name: 'Open Listening' }).click();
  await expect(page.getByRole('heading', { name: 'Listening', exact: true })).toBeVisible();
});

function wav(){const b=Buffer.alloc(44+16000*2*6);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}

test('saved Google outputs carry official attribution independent of current provider',async({page})=>{
  await page.goto('/podlingua/');
  await page.getByLabel('Import transcript').setInputFiles({name:'Google.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...transcript,translationProvider:'google'}))});
  await expect(page.locator('.segment img[alt="powered by Google Translate"]')).toHaveCount(2);
  await page.getByRole('button',{name:'Engine settings'}).click();
  await page.getByLabel('Translation provider',{exact:true}).selectOption('google');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.getByRole('button',{name:'Translate with Google',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Engine settings'}).click();
  await page.getByLabel('Translation provider',{exact:true}).selectOption('deepl');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.locator('.segment img[alt="powered by Google Translate"]')).toHaveCount(2);
});

test('audio persists, transcript attaches, measured words synchronize without target timing',async({page})=>{
  await page.goto('/podlingua/');
  await page.getByLabel('Import audio',{exact:true}).setInputFiles([{name:'First.wav',mimeType:'audio/wav',buffer:wav()},{name:'Second.wav',mimeType:'audio/wav',buffer:wav()}]);
  await expect(page.getByRole('button',{name:'Open Second',exact:true})).toBeVisible();
  await page.getByLabel('Import transcript').setInputFiles({name:'Words.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(transcript))});
  await expect(page.locator('#status')).toContainText('attached');
  await expect(page.locator('#library .library-item')).toHaveCount(2);
  await page.locator('#audio').evaluate(a=>{a.currentTime=.8;a.dispatchEvent(new Event('timeupdate'));});
  await expect(page.locator('.word-active')).toContainText('begins');
  await expect(page.locator('.translation .timed-word')).toHaveCount(0);
  await page.locator('#transcript').dispatchEvent('wheel');
  await expect(page.getByLabel('Follow audio')).not.toBeChecked();
  await page.getByRole('button',{name:'Seek to 00:03',exact:true}).click();
  await expect.poll(()=>page.locator('#audio').evaluate(a=>a.currentTime)).toBeGreaterThanOrEqual(3);
  await page.reload();
  await page.getByRole('button',{name:'Open First',exact:true}).click();
  await expect.poll(()=>page.locator('#audio').evaluate(a=>a.duration)).toBe(6);
});

test('settings have separate session keys and changing them sends no requests',async({page})=>{
  let external=0;page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('blob:'))external++;});
  await page.goto('/podlingua/');
  await page.getByRole('button',{name:'Engine settings'}).click();
  await expect(page.locator('#cloud-consent')).not.toBeChecked();
  await expect(page.locator('#download-consent')).not.toBeChecked();
  await page.getByLabel('Transcription provider',{exact:true}).selectOption('openai');
  await page.getByLabel('Translation provider',{exact:true}).selectOption('deepl');
  await page.getByLabel('Transcription API key',{exact:true}).fill('session-test-asr');
  await page.getByLabel('Translation API key',{exact:true}).fill('session-test-tl');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  expect(external).toBe(0);
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('session-test');
  await page.reload();await page.getByRole('button',{name:'Engine settings'}).click();
  await expect(page.getByLabel('Transcription API key',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Translation API key',{exact:true})).toHaveValue('');
});

async function cloudSettings(page,provider='google'){
  await page.getByRole('button',{name:'Engine settings'}).click();
  await page.getByLabel('Translation provider',{exact:true}).selectOption(provider);
  await page.locator('#cloud-consent').check();
  await page.getByRole('button',{name:'Done',exact:true}).click();
}
test('word lookup reverses target language and Google results display official badge',async({page})=>{
  const requests=[];
  await page.route('https://translation.googleapis.com/**',async route=>{requests.push(route.request().postDataJSON());await route.fulfill({json:{data:{translations:[{translatedText:'Result from test transport'}]}}});});
  page.on('dialog',d=>d.accept());
  await importDoc(page);await cloudSettings(page);
  await page.locator('.original .word').first().click();
  await expect(page.locator('#lookup-result')).toHaveText('Result from test transport');
  await expect(page.locator('#word-popup img[alt="powered by Google Translate"]')).toBeVisible();
  await page.getByRole('button',{name:'Close word lookup'}).click();
  await page.locator('.translation .word').first().click();
  await expect(page.locator('#lookup-result')).toHaveText('Result from test transport');
  expect(requests.map(r=>[r.source,r.target])).toEqual([['en','fr'],['fr','en']]);
});

test('translation queue is sequential and retains saved provider metadata',async({page})=>{
  let running=0,maxRunning=0,calls=0;
  await page.route('https://translation.googleapis.com/**',async route=>{running++;maxRunning=Math.max(maxRunning,running);calls++;await new Promise(r=>setTimeout(r,80));const texts=route.request().postDataJSON().q;running--;await route.fulfill({json:{data:{translations:texts.map(t=>({translatedText:'Translated '+t}))}}});});
  page.on('dialog',d=>d.accept());
  await page.goto('/podlingua/');
  for(const name of ['One','Two']){await page.getByLabel('Import transcript').setInputFiles({name:name+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({language:'en',segments:[{start:0,end:1,text:name}]}))});await expect(page.locator('#episode-title')).toHaveText(name);}
  await cloudSettings(page);await page.getByRole('button',{name:'Translate queue with Google'}).click();
  await expect(page.locator('#status')).toHaveText('Finished 2 episodes.');expect(calls).toBe(2);expect(maxRunning).toBe(1);
  await page.reload();await page.getByRole('button',{name:'Open One',exact:true}).click();
  await expect(page.locator('.translation')).toContainText('Translated One');
  await expect(page.locator('.google-attribution')).toBeVisible();
});

test('cancel exposes explicit retry and deleted episode cannot be resurrected by pending result',async({page})=>{
  let release;const gate=new Promise(r=>release=r);let started;
  const requestStarted=new Promise(r=>started=r);
  await page.route('https://translation.googleapis.com/**',async route=>{started();await gate;await route.fulfill({json:{data:{translations:[{translatedText:'Late one'},{translatedText:'Late two'}]}}}).catch(()=>{});});
  page.on('dialog',d=>d.accept());
  await importDoc(page);await cloudSettings(page);await page.getByRole('button',{name:'Translate with Google',exact:true}).click();await requestStarted;
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Delete Listening',exact:true}).click();release();
  await expect(page.locator('#library .library-item')).toHaveCount(0);
  await page.reload();await expect(page.locator('#library .library-item')).toHaveCount(0);
});

test('mobile reader supports layout and RTL, subtitle errors remain explicit and HTML stays inert',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/podlingua/');
  await page.getByLabel('Import transcript').setInputFiles({name:'Bad.srt',mimeType:'text/plain',buffer:Buffer.from('Untimed words')});
  await expect(page.locator('#status')).toContainText('Expected SRT');
  await page.getByLabel('Import transcript').setInputFiles({name:'Safe.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:00,000 --> 00:00:02,000\n<img src=x onerror=alert(1)> שלום')});
  await expect(page.locator('.original')).toContainText('<img');await expect(page.locator('.original img')).toHaveCount(0);
  await page.getByLabel('Reading layout').selectOption('columns');
  await page.getByRole('button',{name:'Reading options'}).click();await page.locator('#rtl').check();
  await expect(page.locator('#transcript')).toHaveClass(/columns.*force-rtl/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('lookup consent errors are visible in the popup without a network request',async({page})=>{
  await importDoc(page);await page.locator('.original .word').first().click();
  await expect(page.locator('#lookup-result')).toContainText('consent');
});
test('unofficial status and provider-side spending-cap limitation are visible',async({page})=>{
 await page.goto('/podlingua/');await expect(page.locator('.main-footer')).toContainText('unofficial AntennaPod');
 await page.getByRole('button',{name:'Engine settings'}).click();await expect(page.locator('#settings')).toContainText('hard spending limits');
});

test('replacing an attached transcript invalidates a pending translation result',async({page})=>{
  let release,started;const gate=new Promise(r=>release=r),began=new Promise(r=>started=r);
  await page.route('https://translation.googleapis.com/**',async route=>{started();await gate;await route.fulfill({json:{data:{translations:[{translatedText:'Stale one'},{translatedText:'Stale two'}]}}});});
  page.on('dialog',d=>d.accept());await page.goto('/podlingua/');
  await page.getByLabel('Import audio',{exact:true}).setInputFiles({name:'Audio.wav',mimeType:'audio/wav',buffer:wav()});
  await expect(page.locator('#episode-title')).toHaveText('Audio');
  await page.getByLabel('Import transcript').setInputFiles({name:'Initial.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(transcript))});
  await expect(page.locator('#status')).toContainText('attached');await cloudSettings(page);
  await page.getByRole('button',{name:'Translate with Google',exact:true}).click();await began;
  await page.getByLabel('Import transcript').setInputFiles({name:'Replacement.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({language:'en',segments:[{start:0,end:2,text:'Replacement wins.'}]}))});
  await expect(page.locator('.original').first()).toContainText('Replacement wins.');release();
  await expect(page.locator('#cancel')).toBeHidden();
  await page.reload();await page.getByRole('button',{name:'Open Audio',exact:true}).click();
  await expect(page.locator('.original')).toContainText('Replacement wins.');await expect(page.locator('.translation')).not.toContainText('Stale');
});

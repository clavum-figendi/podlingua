import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

// Isolated source-module browser coverage until the parent imports this additive UI.
// Modules are actual working files, not substitutes or fixture implementations.
test.beforeEach(async({page})=>{
 await page.route('**/parity-source/*.js',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop();
  if(!['parity-ui.js','parity.js','catalog.js','storage.js','podcasts.js'].includes(name))return route.abort();
  try{await route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../src/'+name,import.meta.url),'utf8')});}catch{await route.fulfill({status:404,body:'Module not implemented'});}
 });
 await page.goto('/podlingua/');
 await page.evaluate(async()=>{
  const storage=await import('/parity-source/storage.js');const catalog=await import('/parity-source/catalog.js');
  await storage.saveEpisode({id:'browser-a',title:'Zulu',position:8,played:true,playedAt:10,listenedSeconds:6,audio:new Blob(['audio']),duration:30});
  await storage.saveEpisode({id:'browser-b',title:'Alpha',duration:90});
  await catalog.saveSubscription({id:'https://example.org/browser',title:'<img src=x onerror=alert(1)>'});
  await catalog.mutateAppState(s=>{s.queue=['browser-a','browser-b'];s.settings={};s.stats={listeningSeconds:6};});
  window.dispatchEvent(new Event('podlingua:library'));
 });
 await page.getByRole('button',{name:'Queue',exact:true}).click();
});

test('advanced queue controls persist sorting and lock, survive existing panel re-render',async({page})=>{
 await page.getByText('Advanced library controls',{exact:true}).click();
 await page.getByLabel('Queue sort order',{exact:true}).selectOption('title');
 await page.getByLabel('Keep queue sorted',{exact:true}).check();
 await page.getByRole('button',{name:'Save queue policy',exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>(await (await import('/parity-source/catalog.js')).getAppState()).queue)).toEqual(['browser-b','browser-a']);
 await page.getByLabel('Lock manual queue changes',{exact:true}).check();
 await page.getByRole('button',{name:'Save queue policy',exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>(await (await import('/parity-source/catalog.js')).getAppState()).settings.queueLocked)).toBe(true);
 await page.locator('.pc-episode').first().getByRole('button',{name:'Remove from queue',exact:true}).click();await expect(page.locator('#podcast-message')).toContainText('Queue is locked');await expect(page.locator('.pc-episode')).toHaveCount(2);
 await page.getByRole('button',{name:'History',exact:true}).click();
 await expect(page.getByText('Advanced library controls',{exact:true})).toHaveCount(1);
});

test('local selection creates real stored blobs; report and confirmed destructive controls work',async({page})=>{
 await page.getByText('Advanced library controls',{exact:true}).click();
 await page.getByLabel('Import local media files',{exact:true}).setInputFiles([{name:'<unsafe>.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('local bytes')}]);
 await expect(page.locator('#parity-status')).toContainText('Imported 1');
 expect(await page.evaluate(async()=>{const s=await import('/parity-source/storage.js');const local=(await s.listEpisodes()).find(e=>e.id.startsWith('local-'));return {title:local.title,bytes:await local.audio.text()};})).toEqual({title:'<unsafe>',bytes:'local bytes'});
 await expect(page.getByRole('heading',{name:'Measured listening and library inventory'})).toBeVisible();
 page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Clear playback history',exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>(await (await import('/parity-source/storage.js')).getEpisode('browser-a')).position)).toBe(0);
 await page.getByRole('button',{name:'Reset listening statistics',exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>(await (await import('/parity-source/catalog.js')).getAppState()).stats.listeningSeconds)).toBe(0);
});

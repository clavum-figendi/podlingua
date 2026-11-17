import {test,expect} from '@playwright/test';

// Exercise the real application entry point; no source imports or injected UI.
async function open(page){
 await page.goto('/podlingua/');
 await expect(page.locator('#podcast-nav')).toBeAttached();
 await expect(page.locator('#listening-dock')).toBeAttached();
}
function wav(){const b=Buffer.alloc(44+32000*30);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
test('original inline icons enrich navigation and important actions without changing their names',async({page})=>{
 await open(page);
 for(const name of ['Home','Discover','Subscriptions','All episodes','Inbox','Queue','Favorites','Downloads','History','Statistics','Study reader']){
  const button=page.getByRole('button',{name,exact:true});
  await expect(button.locator('svg[aria-hidden="true"]')).toHaveCount(1);
 }
 for(const selector of ['#settings-open','#transcribe','#translate','#design-play','.intro .import-label']){
  await expect(page.locator(selector).first().locator('svg[aria-hidden="true"]')).toHaveCount(1);
 }
 await page.getByRole('button',{name:'Engine settings'}).click();
 await page.getByLabel('Translation provider',{exact:true}).selectOption('google');
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await expect(page.getByRole('button',{name:'Translate with Google',exact:true}).locator('svg')).toHaveCount(1);
 expect(await page.locator('svg use').count()).toBe(0);
});

test('reader utilities use named disclosure while essential actions stay immediately available',async({page})=>{
 await open(page);
 for(const name of ['Reading appearance','Bookmarks & chapters','Sleep timer & repeat','Downloads & video','Listening clarity']){
  const section=page.locator('details').filter({has:page.getByText(name,{exact:true})});
  await expect(section).not.toHaveAttribute('open','');
  await expect(section.locator('summary')).toBeVisible();
 }
 await expect(page.locator('#font-up')).not.toBeVisible();
 expect(await page.locator('.player-tools').evaluate(tools=>Boolean(document.querySelector('#transcript').compareDocumentPosition(tools)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await page.getByText('Reading appearance',{exact:true}).click();
 await page.getByRole('button',{name:'Increase font size'}).click();
 await expect(page.locator('#transcript')).toHaveCSS('--reader-size','20px');
 await page.getByRole('button',{name:'Reading options',exact:true}).click();
 await page.getByLabel('Force RTL').check();
 await expect(page.locator('#transcript')).toHaveClass(/force-rtl/);
 await page.getByText('Sleep timer & repeat',{exact:true}).click();
 await page.getByRole('button',{name:'Set timer',exact:true}).click();
 await expect(page.locator('#sleep-status')).toContainText('remaining');
 await page.getByRole('button',{name:'Cancel timer',exact:true}).click();
 await expect(page.locator('#sleep-status')).toHaveText('Off');
 for(const selector of ['#skip-back','#skip-forward','#transcribe','#translate','#layout','#follow','#export'])await expect(page.locator(selector)).toBeVisible();
 await expect(page.locator('.intro .import-label')).toHaveCount(2);
 await expect(page.locator('#listening-dock #audio')).toHaveCount(1);
});

test('mobile touch targets and persistent transport remain usable at narrow widths',async({page})=>{
 await page.setViewportSize({width:320,height:740});await open(page);
 const targets=['#design-menu','#design-play','#design-seek','#speed','.intro .import-label','#transcribe','#translate','#skip-back','#skip-forward','.reader-actions > .check','#layout','details > summary'];
 for(const selector of targets)for(const target of await page.locator(selector).all()){
  if(!await target.isVisible())continue;
  const box=await target.boundingBox();expect(box.height,selector).toBeGreaterThanOrEqual(44);expect(box.width,selector).toBeGreaterThanOrEqual(44);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 for(const button of await page.locator('#podcast-nav button').all()){const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);}
 await page.getByRole('button',{name:'Discover',exact:true}).click();
 await expect(page.locator('#listening-dock')).toBeInViewport();
 for(const control of await page.locator('#podcast-panel button, #podcast-panel select, #podcast-panel summary, #podcast-panel input:not([type=checkbox])').all()){
  if(!await control.isVisible())continue;
  const box=await control.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('disclosed bookmark and clarity controls still operate on the original media',async({page})=>{
 await open(page);
 await page.getByLabel('Import audio',{exact:true}).setInputFiles({name:'Quiet practice.wav',mimeType:'audio/wav',buffer:wav()});
 await expect.poll(()=>page.locator('#audio').evaluate(a=>a.duration)).toBe(30);
 await page.locator('#audio').evaluate(a=>{window.originalMedia=a;a.currentTime=5;});
 await page.getByText('Bookmarks & chapters',{exact:true}).click();
 page.once('dialog',dialog=>dialog.accept('A useful moment'));
 await page.locator('#bookmark-add').click();
 await expect(page.locator('#status')).toContainText('Bookmark saved');
 await page.locator('#audio').evaluate(a=>a.currentTime=12);
 await page.getByRole('button',{name:'Bookmarks',exact:true}).click();
 await page.getByRole('button',{name:'0:05 · A useful moment',exact:true}).click();
 await expect.poll(()=>page.locator('#audio').evaluate(a=>a.currentTime)).toBe(5);
 await page.getByText('Listening clarity',{exact:true}).click();
 await page.getByRole('button',{name:'Analyze listening audio',exact:true}).click();
 await expect(page.getByLabel('Skip measured silence',{exact:true})).toBeEnabled();
 await expect(page.getByLabel('Level quiet audio',{exact:true})).toBeEnabled();
 expect(await page.locator('#audio').evaluate(a=>a===window.originalMedia)).toBe(true);
});

test('persistent listening instrument moves the original media and keeps playing across navigation',async({page})=>{
 await open(page);
 await page.locator('#audio').evaluate(a=>window.originalMedia=a);
 await page.getByLabel('Import audio',{exact:true}).setInputFiles({name:'Evening practice.wav',mimeType:'audio/wav',buffer:wav()});
 await expect.poll(()=>page.locator('#audio').evaluate(a=>a.duration)).toBe(30);
 await page.getByRole('button',{name:'Play audio',exact:true}).click();
 await expect(page.getByRole('button',{name:'Pause audio',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Discover',exact:true}).click();
 await expect(page.locator('#listening-dock')).toBeVisible();
 expect(await page.locator('#audio').evaluate(a=>a===window.originalMedia&&!a.paused)).toBe(true);
 await expect(page.locator('#audio')).toHaveCount(1);
 await expect(page.locator('#audio-label')).toHaveText('Evening practice');
 await page.getByLabel('Seek audio').fill('12');
 await expect.poll(()=>page.locator('#audio').evaluate(a=>a.currentTime)).toBeGreaterThanOrEqual(12);
 await page.getByRole('button',{name:'Pause audio',exact:true}).click();
 await expect.poll(()=>page.locator('#audio').evaluate(a=>a.paused)).toBe(true);
 await page.getByRole('button',{name:'Study reader',exact:true}).click();
 await expect(page.locator('#listening-dock')).toHaveCount(1);
});
test('mobile navigation is keyboard operable, closes with Escape and has no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);
 const toggle=page.getByRole('button',{name:'Open navigation',exact:true});
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await expect(page.locator('#podcast-nav')).not.toBeVisible();
 await toggle.focus();await page.keyboard.press('Enter');
 await expect(page.locator('#podcast-nav')).toBeVisible();
 await page.keyboard.press('Escape');await expect(toggle).toBeFocused();
 await toggle.click();await page.getByRole('button',{name:'Downloads',exact:true}).click();
 await expect(page.locator('#podcast-panel')).toBeVisible();
 await expect(page.locator('#podcast-nav')).not.toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('#listening-dock')).toBeInViewport();
});
test('quiet empty workspace preserves credits and consent while removing the main disclaimer',async({page})=>{
 await open(page);await expect(page.locator('.honest-note')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Ready for a closer listen.'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Listen a little closer.'})).toHaveCount(0);
 await expect(page.locator('.main-footer a').filter({hasText:'Credits'})).toBeVisible();
 await page.getByRole('button',{name:'Engine settings'}).click();
 await expect(page.locator('#cloud-consent')).toBeVisible();await expect(page.locator('#cloud-consent')).not.toBeChecked();
 await page.getByRole('button',{name:'Close settings'}).click();
 await page.evaluate(()=>document.documentElement.dataset.podcastTheme='dark');
 await expect(page.locator('body')).toHaveCSS('background-color','rgb(29, 31, 30)');
});

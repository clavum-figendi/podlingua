import {test,expect} from '@playwright/test';

// Isolated redesign harness: also works before app.js imports initDesignUI.
async function open(page){
 await page.goto('/podlingua/');
 await expect(page.locator('#podcast-nav')).toBeAttached();
 await expect(page.locator('#listening-dock')).toBeAttached();
}
function wav(){const b=Buffer.alloc(44+32000*30);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
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

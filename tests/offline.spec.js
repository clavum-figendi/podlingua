import {test,expect} from '@playwright/test';
test('downloaded audio and reader work after opt-in offline installation; missing assets invalidate readiness',async({page,context})=>{
 test.setTimeout(120000);page.on('dialog',d=>d.accept());await page.goto('/podlingua/');
 const b=Buffer.alloc(44+32000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);
 await page.getByLabel('Import audio',{exact:true}).setInputFiles({name:'Offline.wav',mimeType:'audio/wav',buffer:b});await expect(page.locator('#episode-title')).toHaveText('Offline');
 await page.getByRole('button',{name:'Enable offline app',exact:true}).click();await expect(page.locator('#offline-status')).toContainText('Ready offline',{timeout:90000});
 await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Open Offline',exact:true}).click();await expect.poll(()=>page.locator('#audio').evaluate(v=>v.duration)).toBe(1);
 expect(await page.evaluate(()=>window.podlinguaOffline.check())).toBe(true);
 await page.evaluate(async()=>{const m=await(await fetch('./offline-manifest.json')).json();const cache=await caches.open(m.cacheName);await cache.delete(m.files.find(f=>f.endsWith('.css')));});
 expect(await page.evaluate(()=>window.podlinguaOffline.check())).toBe(false);
 await context.setOffline(false);await page.getByRole('button',{name:'Enable offline app',exact:true}).click();await expect(page.locator('#offline-status')).toContainText('Ready offline',{timeout:90000});
});

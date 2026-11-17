import {chromium} from '@playwright/test';
// Real public Cloudflare path with normal DNS, TLS and browser security.
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(90000);
try{
 await page.goto(process.env.SMOKE_URL||'https://clavum-figendi.github.io/podlingua/');
 await page.getByRole('button',{name:'Discover',exact:true}).click();
 await page.getByLabel('Feed URL',{exact:true}).fill('https://geschichten-aus-der-geschichte.podigee.io/feed/mp3');
 await page.getByRole('button',{name:'Subscribe by URL',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Subscribed'));
 await page.getByRole('button',{name:'All episodes',exact:true}).click();await page.locator('#pc-search').fill('GAG581');
 await page.locator('.pc-episode').getByRole('button',{name:'Download',exact:true}).click();await page.locator('#audio-recovery').waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/home/hermes/.hermes/cache/scratch/podlingua-relay-mobile.png'});
 await page.getByRole('button',{name:'Use relay and get audio',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#audio-recovery').open||/could not|couldn.t|allowance|permission|failed/i.test(document.querySelector('#audio-recovery-status').textContent),null,{timeout:250000});
 if(await page.locator('#audio-recovery').evaluate(d=>d.open))throw new Error(await page.locator('#audio-recovery-status').innerText());
 await page.locator('#study-action-dialog').waitFor();await page.waitForFunction(()=>document.querySelector('#audio').duration>3000);
 console.log(JSON.stringify({title:await page.locator('#episode-title').innerText(),duration:await page.locator('#audio').evaluate(v=>v.duration),guide:await page.locator('#study-availability').innerText(),downloadConsent:await page.locator('#download-consent').isChecked(),cloudConsent:await page.locator('#cloud-consent').isChecked(),serverless:true}));
 await page.getByRole('button',{name:'Close study guide'}).click();await page.locator('#design-play').click();await page.waitForFunction(()=>document.querySelector('#audio').currentTime>0.5);
 console.log('REAL PUBLISHER AUDIO PLAYBACK PASSED');
}finally{await browser.close();}

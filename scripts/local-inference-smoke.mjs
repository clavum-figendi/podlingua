// Real on-device inference through the production UI: Whisper Tiny + OPUS en→fr, optionally after an offline reload.
// Usage: node scripts/local-inference-smoke.mjs <speech.wav> [--offline] [--report report.json]
// Needs network access to Hugging Face for the first model download. No hosted API is called.
import {chromium} from '@playwright/test';
import {readFile, writeFile} from 'node:fs/promises';

const args = process.argv.slice(2), reportAt = args.indexOf('--report');
const fixture = args.find((a, i) => !a.startsWith('--') && (reportAt < 0 || i !== reportAt + 1));
const offline = args.includes('--offline'), report = reportAt >= 0 ? args[reportAt + 1] : '';
if (!fixture) throw new Error('Pass a real English speech WAV, e.g. the JFK sample used by Whisper.');
const base = process.env.SMOKE_URL || 'http://127.0.0.1:4173/podlingua/';
const browser = await chromium.launch({args: ['--disable-dev-shm-usage'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined});
const context = await browser.newContext(), page = await context.newPage(), errors = [], requests = [], started = Date.now();
page.setDefaultTimeout(60000);
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('blob:')) requests.push(`${r.method()} ${r.url()}`); });
const chooser = async trigger => { const wait = page.waitForEvent('filechooser'); await trigger(); return wait; };
try {
  await page.goto(base + '#/library/files');
  await (await chooser(() => page.locator('.empty [data-act="import-audio"]').click())).setFiles({name: 'Speech.wav', mimeType: 'audio/wav', buffer: await readFile(fixture)});
  await page.goto(base + '#/settings');
  await page.locator('.advanced > summary').click();
  await page.locator('.group > summary', {hasText: 'On-device models'}).click();
  for (const model of ['Xenova/whisper-tiny', 'Xenova/opus-mt-en-fr']) {
    await page.locator(`[data-act="model-download"][data-id="${model}"]`).click();
    await page.locator(`[data-act="model-verify"][data-id="${model}"]`).waitFor({timeout: 600000});
    console.log('DOWNLOADED AND VERIFIED', model);
  }
  if (offline) {
    await page.locator('[data-change="set-offline-only"]').check({force: true});
    await page.locator('[data-act="offline-enable"]').click();
    await page.getByText('App saved on this device').waitFor({timeout: 180000});
    await context.setOffline(true);
    await page.reload();
  }
  await page.goto(base + '#/library/files');
  await page.locator('.ep-main').first().click();
  await page.locator('#sheet [data-act="process"][data-kind="asr"]').click();
  await page.locator('#sheet').getByLabel('Spoken language').selectOption('en');
  await page.locator('#sheet').getByLabel('Translate into').selectOption('fr');
  await page.locator('[data-act="flow-start"]').click();
  await page.locator('#sheet .step-done').nth(1).waitFor({timeout: 900000});
  await page.locator('#sheet [data-act="sheet-read"]').click();
  const asr = await page.locator('#transcript .src').allTextContents(), translated = await page.locator('#transcript .tr').allTextContents();
  const result = {base, offline, elapsedSeconds: (Date.now() - started) / 1000, asr, translated, errors, requests, paidRequests: 0};
  console.log(JSON.stringify(result, null, 2));
  if (report) await writeFile(report, JSON.stringify(result, null, 2));
  if (!asr.join(' ').toLowerCase().includes('americans')) throw new Error('Transcript does not contain the audible word "americans".');
  if (!translated.length || errors.length) throw new Error('Translation missing or page errors occurred.');
  console.log('LOCAL INFERENCE SMOKE PASSED');
} finally { await browser.close(); }

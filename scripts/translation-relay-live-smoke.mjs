// No real credential or billable translation: the upstream probe uses an
// intentionally invalid key and verifies a readable authentication rejection.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined});
try {
  const page = await browser.newPage();
  await page.goto('https://clavum-figendi.github.io/podlingua/', {waitUntil: 'domcontentloaded'});
  const result = await page.evaluate(async () => {
    const base = 'https://podlingua-translation.clavum-figendi.workers.dev';
    const health = await fetch(base + '/health');
    const unauthenticated = await fetch(base + '/deepl/free', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: ['Hello'], target_lang: 'FR'})});
    const invalidKey = await fetch(base + '/deepl/free', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'DeepL-Auth-Key intentionally-invalid-smoke-key:fx'}, body: JSON.stringify({text: ['Hello'], target_lang: 'FR'})});
    return {origin: location.origin, health: {status: health.status, body: await health.json()}, unauthenticated: {status: unauthenticated.status, body: await unauthenticated.json()}, invalidKey: {status: invalidKey.status, body: await invalidKey.json()}, assets: [...document.scripts].map(s => s.src).filter(Boolean)};
  });
  assert.equal(result.origin, 'https://clavum-figendi.github.io');
  assert.equal(result.health.status, 200);
  assert.equal(result.health.body.version, 'translation-cf-1');
  assert.equal(result.unauthenticated.status, 401);
  assert.ok([401, 403].includes(result.invalidKey.status), JSON.stringify(result.invalidKey));
  assert.match(result.invalidKey.body.error, /^deepl_http_(401|403)$/);
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }

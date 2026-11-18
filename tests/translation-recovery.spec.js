import {test, expect} from '@playwright/test';
import {mockNetwork, FEED} from './fixtures.js';

async function prepare(page, provider = 'deepl') {
  await mockNetwork(page.context());
  await page.goto('/podlingua/#/discover');
  await page.fill('#discover-q', FEED);
  await page.keyboard.press('Enter');
  await page.locator('.ep-main').first().click();
  await page.locator('#sheet [data-act="process"][data-kind="asr"]').click();
  await page.locator('#sheet').getByLabel('Translate into').selectOption('en');
  await page.locator('input[data-change="flow-engine"][data-kind="translation"][value="online"]').check({force: true});
  await page.locator('select[data-change="flow-provider"]').selectOption(provider);
  await page.locator('[data-input="flow-key"][data-kind="translation"]').fill('test-only-browser-key');
}

test('DeepL translation requires disclosed relay consent and never fetches the blocked browser API', async ({page}) => {
  let direct = 0, relayed = 0;
  await page.route('https://api-free.deepl.com/**', route => { direct++; return route.abort(); });
  await page.route('https://podlingua-translation.clavum-figendi.workers.dev/**', route => {
    relayed++;
    const {text} = route.request().postDataJSON();
    expect(route.request().headers().authorization).toBe('DeepL-Auth-Key test-only-browser-key');
    return route.fulfill({headers: {'Access-Control-Allow-Origin': '*'}, json: {translations: text.map(t => ({text: '[en] ' + t}))}});
  });
  await prepare(page);
  await expect(page.getByText(/Cloudflare receives the text and your DeepL API key/)).toBeVisible();
  await expect(page.locator('[data-act="flow-start"]')).toBeDisabled();
  await expect(page.getByLabel('Allow DeepL relay for this operation')).not.toBeChecked();
  await page.getByLabel('Allow DeepL relay for this operation').check();
  await page.locator('[data-act="flow-start"]').click();
  await expect(page.locator('#sheet .step-done')).toHaveCount(2);
  expect(relayed).toBe(1); expect(direct).toBe(0);
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain('test-only-browser-key');
  expect(stored).not.toContain('allowTranslationRelay');
  await page.locator('#sheet [data-act="sheet-read"]').click();
  await expect(page.locator('#transcript .tr').first()).toContainText('[en]');
  await page.locator('#transcript .w').first().click();
  await expect(page.locator('.bubble')).toContainText('Cloudflare');
  await page.locator('[data-act="lookup-allow"]').click();
  await expect(page.locator('.bubble-result')).toContainText('[en]');
  expect(relayed).toBe(2);
  await page.goto('/podlingua/#/settings');
  await page.locator('[data-change="set-target"]').selectOption('de');
  await page.goto('/podlingua/#/library/all');
  await page.locator('[data-act="lib-tools"]').click();
  await page.locator('[data-act="batch-translate"]').click();
  await expect(page.locator('#confirm')).toContainText('Cloudflare');
  await expect(page.locator('#confirm')).toContainText('API key');
  await page.locator('#confirm button[value="no"]').click();
  expect(relayed).toBe(2);
  await page.locator('[data-act="batch-translate"]').click();
  await page.locator('#confirm button[value="yes"]').click();
  await expect.poll(() => relayed).toBe(3);
});

test('Mistral quota failure is visible without automatic retries or losing the publisher transcript', async ({page}) => {
  let calls = 0;
  await page.route('https://api.mistral.ai/**', route => {
    calls++;
    return route.fulfill({status: 429, headers: {'Access-Control-Allow-Origin': '*', 'Retry-After': '60', 'Access-Control-Expose-Headers': 'Retry-After'}, json: {error: 'fixture quota'}});
  });
  await prepare(page, 'mistral');
  await page.locator('[data-act="flow-start"]').click();
  await expect(page.locator('#sheet')).toContainText('HTTP 429');
  await expect(page.locator('#sheet')).toContainText('60 seconds');
  await expect(page.locator('#sheet')).toContainText('on-device translation');
  expect(calls).toBe(1);
  await page.locator('#sheet [data-act="sheet-read"]').click();
  await expect(page.locator('#transcript .seg')).toHaveCount(3);
  await expect(page.locator('#transcript .tr')).toHaveCount(0);
  expect(calls).toBe(1);
});

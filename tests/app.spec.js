import {test, expect} from '@playwright/test';
import {mockNetwork, FEED, wav, transcriptJSON} from './fixtures.js';

const app = '/podlingua/';
test.beforeEach(async ({context}) => { await mockNetwork(context); });

async function choose(page, trigger, files) {
  const chooser = page.waitForEvent('filechooser');
  await trigger();
  await (await chooser).setFiles(files);
}
async function follow(page) {
  await page.goto(app + '#/discover');
  await page.fill('#discover-q', FEED);
  await page.keyboard.press('Enter');
  await expect(page.locator('.show-info h1')).toHaveText('Café des langues');
}

test('first run explains itself visually and remembers the language pair', async ({page}) => {
  await page.goto(app);
  await expect(page.getByRole('heading', {name: /Listen in one language/})).toBeVisible();
  await page.getByLabel('Translate into').selectOption('de');
  await page.reload();
  await expect(page.getByLabel('Translate into')).toHaveValue('de');
  await expect(page.getByRole('link', {name: 'Find a podcast'})).toBeVisible();
});

test('discover, follow, transcribe from the publisher, translate online and read along', async ({page}) => {
  await page.goto(app + '#/discover');
  await expect(page.locator('.grid-tiles .tile')).toHaveCount(6);
  await page.fill('#discover-q', 'français');
  await page.keyboard.press('Enter');
  await page.locator(`[data-act="subscribe"][data-url="${FEED}"]`).click();
  await expect(page.locator('.toast')).toContainText('Subscribed to Café des langues');
  await page.goto(app + '#/show/' + encodeURIComponent(FEED));
  await expect(page.locator('.ep')).toHaveCount(8);

  await page.locator('.ep-main').first().click();
  await expect(page.locator('#sheet .sheet-hero h2')).toHaveText('Le marché du dimanche');
  await page.locator('#sheet [data-act="process"][data-kind="asr"]').click();
  await expect(page.locator('#sheet .choice label.on', {hasText: 'Publisher'})).toBeVisible();
  await page.locator('#sheet').getByLabel('Translate into').selectOption('en');
  await page.locator('input[data-change="flow-engine"][data-kind="translation"][value="online"]').check({force: true});
  await page.locator('select[data-change="flow-provider"]').selectOption('libretranslate');
  await page.locator('[data-act="flow-start"]').click();
  await expect(page.locator('#sheet .step-done')).toHaveCount(2);

  await page.locator('#sheet [data-act="sheet-read"]').click();
  await expect(page.locator('#transcript .seg')).toHaveCount(3);
  await expect(page.locator('#transcript .tr').first()).toHaveText('Hello and welcome to the Language Café.');
  await page.locator('#transcript .w', {hasText: 'marché'}).first().click();
  await page.locator('[data-act="lookup-allow"]').click();
  await expect(page.locator('.bubble-result')).toHaveText('[en] marché');
  await page.locator('.bubble [data-act="seek"]').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('#media').currentTime)).toBeGreaterThan(2);
});

test('a website or feed link in the search box follows the show directly', async ({page}) => {
  await follow(page);
  await page.goto(app + '#/library/shows');
  await expect(page.locator('.tile')).toHaveCount(1);
  await expect(page.locator('.count')).toHaveText('8');
});

test('queue and bulk selection', async ({page}) => {
  await follow(page);
  await page.goto(app + '#/library/new');
  await page.locator('[data-act="queue-toggle"]').first().click();
  await expect(page.locator('.tab', {hasText: 'Queue'}).locator('b')).toHaveText('1');
  await page.locator('[data-act="select-mode"]').click();
  await page.locator('[data-change="select"]').nth(0).check();
  await page.locator('[data-change="select"]').nth(1).check();
  await page.locator('[data-act="bulk"][data-op="played"]').click();
  await expect(page.locator('.ep')).toHaveCount(6);
  await expect(page.locator('.tab', {hasText: 'Queue'}).locator('b')).toHaveCount(0);
});

test('local audio plays in the mini player and accepts an imported transcript', async ({page}) => {
  await page.goto(app + '#/library/files');
  await choose(page, () => page.locator('.empty [data-act="import-audio"]').click(), {name: 'lesson.wav', mimeType: 'audio/wav', buffer: wav()});
  await expect(page.locator('.ep-title')).toHaveText('lesson');
  await page.locator('.ep-play').click();
  await expect(page.locator('#player .mini-title')).toHaveText('lesson');
  await page.locator('#player .mini-open').click();
  await expect(page.getByRole('heading', {name: 'Read along'})).toBeVisible();
  await choose(page, () => page.locator('.read-empty [data-act="reader-import"]').click(), {name: 'lesson.json', mimeType: 'application/json', buffer: Buffer.from(transcriptJSON)});
  await expect(page.locator('#transcript .seg')).toHaveCount(3);
  await page.locator('[data-act="reader-options"]').click();
  await page.locator('label', {hasText: 'Side by side'}).click();
  await expect(page.locator('.reader')).toHaveClass(/layout-columns/);
});

test('settings keep technical options behind Advanced', async ({page}) => {
  await page.goto(app + '#/settings');
  await page.locator('label', {hasText: 'Dark'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByText('Speech recognition')).toBeHidden();
  await page.locator('.advanced > summary').click();
  await page.locator('.group > summary', {hasText: 'Speech recognition'}).click();
  await page.locator('select[data-change="set-provider"][data-kind="asr"]').selectOption('groq');
  await expect(page.locator('input[data-input="set-key"][data-kind="asr"]')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('[data-act="backup-export"]').click();
  expect((await download).suggestedFilename()).toMatch(/^podlingua-backup-.*\.zip$/);
});

test('phones get bottom tabs and bottom sheets', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await follow(page);
  const rail = await page.locator('.rail').boundingBox();
  expect(rail.y + rail.height).toBeGreaterThan(830);
  await page.locator('.ep-main').first().click();
  const sheet = await page.locator('#sheet').boundingBox();
  expect(Math.round(sheet.y + sheet.height)).toBeGreaterThanOrEqual(843);
});

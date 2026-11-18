import {test, expect} from '@playwright/test';
import {mockNetwork} from './fixtures.js';

test('speaker labels default on only for supported services and explicit opt-out survives reload', async ({page}) => {
  await mockNetwork(page.context());
  await page.goto('/podlingua/#/settings');
  await page.locator('.advanced > summary').click();
  await page.locator('.group > summary', {hasText: 'Speech recognition'}).click();
  const provider = page.locator('[data-change="set-provider"][data-kind="asr"]');
  const speakers = page.locator('[data-change="set-diarization"]');
  await expect(speakers).not.toBeChecked();
  await provider.selectOption('deepgram');
  await expect(speakers).toBeChecked();
  await speakers.uncheck();
  await provider.selectOption('gladia');
  await expect(speakers).not.toBeChecked();
  await page.reload();
  await page.locator('.advanced > summary').click();
  await page.locator('.group > summary', {hasText: 'Speech recognition'}).click();
  await expect(speakers).not.toBeChecked();
  await speakers.check();
  await provider.selectOption('local');
  await expect(speakers).not.toBeChecked();
  await provider.selectOption('speechmatics');
  await expect(speakers).toBeChecked();
});

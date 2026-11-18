import {test, expect} from '@playwright/test';
import {mockNetwork, FEED} from './fixtures.js';

test('account model selection is explicit and the chosen model reaches the actual translation request', async ({page}) => {
  await mockNetwork(page.context());
  let lists = 0, inference = 0;
  await page.route('https://api.groq.com/openai/v1/models', route => {
    lists++; expect(route.request().headers().authorization).toBe('Bearer fixture-ui-key');
    return route.fulfill({headers: {'Access-Control-Allow-Origin': '*'}, json: {data: [{id: 'account-current-chat', active: true}]}});
  });
  await page.route('https://api.groq.com/openai/v1/chat/completions', route => {
    inference++; const body = route.request().postDataJSON();
    expect(body.model).toBe('account-current-chat');
    expect(body.max_completion_tokens ?? body.max_tokens).toBe(1024);
    const texts = JSON.parse(body.messages.at(-1).content);
    return route.fulfill({headers: {'Access-Control-Allow-Origin': '*'}, json: {choices: [{message: {content: JSON.stringify(texts.map(t => '[en] ' + t))}}]}});
  });
  await page.goto('/podlingua/#/settings');
  await page.locator('.advanced > summary').click();
  await page.locator('.group > summary', {hasText: 'Translation', exact: true}).click();
  await page.locator('[data-change="set-provider"][data-kind="translation"]').selectOption('groq');
  await page.locator('[data-input="set-key"][data-kind="translation"]').fill('fixture-ui-key');
  await page.locator('[data-act="provider-models-load"]').click();
  await expect(page.locator('#confirm')).toContainText('No transcript');
  expect(lists).toBe(0); expect(inference).toBe(0);
  await page.locator('#confirm button[value="yes"]').click();
  await expect(page.getByLabel('Available translation models')).toBeVisible();
  await page.getByLabel('Available translation models').selectOption('account-current-chat');
  await page.getByLabel('Maximum translation output tokens').fill('1024');
  await page.getByLabel('Maximum translation output tokens').dispatchEvent('change');
  expect(inference).toBe(0);
  await page.goto('/podlingua/#/discover');
  await page.fill('#discover-q', FEED); await page.keyboard.press('Enter');
  await page.locator('.ep-main').first().click();
  await page.locator('#sheet [data-act="process"][data-kind="asr"]').click();
  await page.locator('#sheet').getByLabel('Translate into').selectOption('en');
  await expect(page.locator('#sheet').getByLabel('Translation model ID')).toHaveValue('account-current-chat');
  await page.locator('[data-act="flow-start"]').click();
  await expect(page.locator('#sheet .step-done')).toHaveCount(2);
  expect(inference).toBe(1);
});

test('new provider controls disclose backend requirements and keep keys scoped to the exact endpoint', async ({page}) => {
  await mockNetwork(page.context());
  await page.goto('/podlingua/#/settings');
  await page.locator('.advanced > summary').click();
  await page.locator('.group > summary', {hasText: 'Translation', exact: true}).click();
  const provider = page.locator('[data-change="set-provider"][data-kind="translation"]');
  for(const id of ['cerebras','deepseek','huggingface','nvidia','sambanova']) {
    await provider.selectOption(id);
    await expect(page.getByLabel('Translation model ID')).toHaveValue('');
    if(['nvidia','sambanova'].includes(id)) {
      await expect(page.locator('[data-act="provider-models-load"]')).toBeDisabled();
      await expect(page.locator('.provider-model-controls')).toContainText('trusted compatible HTTPS backend');
    } else await expect(page.locator('[data-act="provider-models-load"]')).toBeEnabled();
  }
  await page.locator('[data-input="set-key"][data-kind="translation"]').fill('fixture-backend-key');
  await page.locator('[data-change="set-engine"][data-kind="translation"][data-key="endpoint"]').fill('https://trusted.example/v1/chat/completions');
  await page.locator('[data-change="set-engine"][data-kind="translation"][data-key="endpoint"]').dispatchEvent('change');
  await expect(page.locator('[data-input="set-key"][data-kind="translation"]')).toHaveValue('');
  await expect(page.locator('[data-act="provider-models-load"]')).toBeEnabled();
  const stored = await page.evaluate(() => localStorage.getItem('podlingua-prefs-v2'));
  expect(stored).not.toContain('fixture-backend-key');
});

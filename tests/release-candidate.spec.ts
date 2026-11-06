import { test, expect } from '@playwright/test';
import { wav } from './helpers/audio';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('wave-booted', '1');
    localStorage.setItem('wave-animations-enabled', 'false');
    localStorage.setItem('wave-mix-v2', 'false');
    localStorage.setItem('wave-autoplay', 'false');
    localStorage.setItem('wave-automatic-lyrics', 'false');
    const original = HTMLMediaElement.prototype.play;
    Object.defineProperty(window, '__playCount', { value: 0, writable: true });
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { __playCount: number }).__playCount++;
      return original.call(this);
    };
  });
  await page.route('https://lrclib.net/**', (route) => route.abort());
  await page.goto('/Library');
  await page.getByLabel('Import audio files').setInputFiles([
    {
      name: 'Signal.wav',
      mimeType: 'audio/wav',
      buffer: wav('Signal', 20, 8000, 16, 'Northbound', 'Record', 'Soul'),
    },
    {
      name: 'Other.wav',
      mimeType: 'audio/wav',
      buffer: wav('Other', 20, 8000, 16, 'Second Artist', 'Another record', 'Rock'),
    },
  ]);
  await expect(page.getByRole('status')).toContainText('2 tracks added');
});
test('search honors genre, IME composition and collection-specific Enter without implicit playback', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search library' });
  await search.fill('soul');
  await expect(
    page.getByRole('button', { name: 'Play Signal by Northbound', exact: true }),
  ).toBeVisible();
  await search.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  expect(
    await page.evaluate(() => (window as unknown as { __playCount: number }).__playCount),
  ).toBe(0);
  await page.getByRole('button', { name: 'Artists', exact: true }).last().click();
  await search.fill('Northbound');
  await search.press('Enter');
  await expect(page.getByRole('region', { name: 'Artist details' })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __playCount: number }).__playCount),
  ).toBe(0);
});
for (const autoplay of [false, true]) {
  test(`AutoPlay ${autoplay ? 'extends' : 'does not extend'} a one-result queue`, async ({
    page,
  }) => {
    if (autoplay) {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Playback', exact: true }).click();
      await page.getByRole('switch', { name: 'Autoplay', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const search = page.getByRole('searchbox', { name: 'Search library' });
    await search.fill('Signal');
    await search.press('Enter');
    await page.getByRole('button', { name: 'Show queue', exact: true }).click();
    const queue = page.getByRole('dialog', { name: 'Queue', exact: true });
    await expect(queue.locator('.queue-entry')).toHaveCount(autoplay ? 2 : 1);
    await expect(
      queue.getByRole('button', { name: 'Play Signal from queue', exact: true }),
    ).toBeVisible();
    if (autoplay)
      await expect(
        queue.getByRole('button', { name: 'Play Other from queue', exact: true }),
      ).toBeVisible();
  });
}

import { expect, test } from './helpers/returning-user';
import { wav } from './helpers/audio';

test('Library offers editing and Auto Fill; lookups start only after consent', async ({ page }) => {
  let deezer = 0;
  await page.route('**/api/deezer-search', async (route) => {
    deezer++;
    await route.fulfill({ json: { results: [] } });
  });
  await page.route('https://itunes.apple.com/**', async (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 8) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.goto('/Settings/Library');
  const editing = page.getByRole('switch', { name: 'Library editing' });
  const autoFill = page.getByRole('switch', { name: 'Auto Fill' });
  await expect(editing).toBeVisible();
  await expect(autoFill).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.settings-page-options').getByRole('switch')).toHaveCount(2);
  await page.waitForTimeout(1600);
  expect(deezer).toBe(0);
  await autoFill.click();
  await expect(autoFill).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => deezer, { timeout: 7000 }).toBeGreaterThan(0);
  await autoFill.click();
  await expect(autoFill).toHaveAttribute('aria-checked', 'false');
});

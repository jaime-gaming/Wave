import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 320, height: 568 },
  { width: 667, height: 375 },
]) {
  test(`phone controls and forms remain usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('wave-animations-enabled', 'false'));
    await page.goto('/');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /viewport-fit=cover/,
    );
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    for (const button of await navigation.getByRole('button').all()) {
      const bounds = await button.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    }
    await navigation.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByRole('button', { name: 'Playlists', exact: true }).click();
    await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create playlist', exact: true });
    const input = dialog.getByLabel('Playlist name');
    expect(
      await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    await input.fill('Phone playlist');
    const close = await dialog.getByRole('button', { name: 'Close dialog' }).boundingBox();
    expect(close!.width).toBeGreaterThanOrEqual(44);
    expect(close!.height).toBeGreaterThanOrEqual(44);
    await dialog.getByRole('button', { name: 'Create playlist', exact: true }).click();
    await expect(page.locator('.playlist-detail h2')).toHaveText('Phone playlist');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
  });
}

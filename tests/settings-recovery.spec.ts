import { test, expect } from './helpers/returning-user';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`direct Settings and each section remain usable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/Settings');
    await expect(page.getByRole('button', { name: 'Appearance', exact: true })).toBeVisible();
    for (const section of [
      'Appearance',
      'Playback',
      'Lyrics',
      'Library',
      'Devices',
      'Storage',
      'About',
    ]) {
      await page
        .locator('.settings-hub')
        .getByRole('button', { name: section, exact: true })
        .click();
      await expect(
        page.locator('.settings-hub').getByRole('heading', { name: section, exact: true }),
      ).toBeVisible();
      await expect(page.locator('.settings-hub')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.getByRole('button', { name: 'Back to settings' }).click();
      await expect(
        page.locator('.settings-hub').getByRole('button', { name: section, exact: true }),
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

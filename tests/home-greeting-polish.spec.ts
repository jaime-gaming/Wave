import { test, expect } from './helpers/returning-user';

test('the welcome gives way to Home in the same heading and mobile shortcuts stay compact', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('wave-listener-name', 'Jaime');
    localStorage.setItem('wave-language', 'es');
    localStorage.setItem('wave-android-prompt', 'dismissed');
  });
  await page.goto('/');
  const heading = page.locator('.library-header h1');
  await expect(heading).toContainText('Jaime');
  await expect(heading).toHaveText('Inicio', { timeout: 8000 });
  const shortcuts = page.locator('.home-shortcut');
  await expect(shortcuts).toHaveCount(5);
  const first = await shortcuts.nth(0).boundingBox();
  const second = await shortcuts.nth(1).boundingBox();
  const last = await shortcuts.nth(4).boundingBox();
  expect(first && second && last).toBeTruthy();
  expect(first!.y).toBeCloseTo(second!.y, 0);
  expect(last!.y + last!.height - first!.y).toBeLessThan(210);
  expect(first!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

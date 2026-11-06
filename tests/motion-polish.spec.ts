import { test, expect } from '@playwright/test';
for (const touch of [false, true]) {
  test.describe(`input capability: touch=${touch}`, () => {
    test.use({ hasTouch: touch });
    test('hover feedback matches the input and returns to rest', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.addInitScript(() => {
        sessionStorage.setItem('wave-booted', '1');
        localStorage.setItem('wave-animations-enabled', 'true');
        localStorage.setItem('wave-automatic-lyrics', 'false');
      });
      await page.goto('/');
      await expect(page.getByLabel('Import audio files')).toBeEnabled();
      const card = page.locator('.home-shortcut').first();
      await expect(card).toHaveCSS('transform', 'none');
      await card.hover();
      if (touch) await expect(card).toHaveCSS('transform', 'none');
      else
        await expect
          .poll(() =>
            card.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42),
          )
          .toBeLessThan(-1.5);
      await page.mouse.move(1, 1);
      await expect(card).toHaveCSS('transform', 'none');
      await expect(page.locator('.remix-lede-art')).toHaveCount(0);
    });
  });
}

import { test, expect } from '@playwright/test';
for (const reduced of [false, true]) {
  test(`page motion follows direction and reduced-motion=${reduced}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.addInitScript(() => {
      sessionStorage.setItem('wave-booted', '1');
      localStorage.setItem('wave-animations-enabled', 'true');
      localStorage.setItem('wave-automatic-lyrics', 'false');
    });
    await page.goto('/Library');
    await expect(page.getByLabel('Import audio files')).toBeEnabled();
    await expect(page.locator('.library-surface')).toHaveCSS('transform', 'none');
    await page.evaluate(() => {
      const samples: Array<{ x: number; exiting: boolean }> = [];
      Object.defineProperty(window, '__routeMotion', { value: samples });
      new MutationObserver((records) => {
        for (const { target } of records)
          if (target instanceof HTMLElement && target.matches('.library-surface')) {
            samples.push({
              x: new DOMMatrixReadOnly(getComputedStyle(target).transform).m41,
              exiting: target.inert,
            });
          }
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
    });
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search library' })).toBeVisible();
    await expect(page.locator('.library-surface')).toHaveCSS('transform', 'none');
    const samples = await page.evaluate(
      () =>
        (window as unknown as { __routeMotion: Array<{ x: number; exiting: boolean }> })
          .__routeMotion,
    );
    if (reduced) expect(samples.every(({ x }) => Math.abs(x) < 0.1)).toBe(true);
    else {
      expect(samples.some(({ x, exiting }) => !exiting && x < -1)).toBe(true);
      expect(samples.some(({ x, exiting }) => exiting && x > 1)).toBe(true);
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const playback = page.getByRole('button', { name: 'Playback', exact: true });
    await playback.focus();
    await playback.press('Enter');
    await expect(page.getByRole('switch', { name: 'Fix volume' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings', exact: true }).first()).toBeVisible();
    await expect(page.locator('.wave-ripple')).toHaveCount(0);
  });
}

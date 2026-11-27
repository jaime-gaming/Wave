import { test, expect } from './helpers/returning-user';
for (const reduced of [false, true]) {
  test(`page motion rises from below and reduced-motion=${reduced}`, async ({ page }) => {
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
      const samples: Array<{ x: number; y: number; exiting: boolean }> = [];
      Object.defineProperty(window, '__routeMotion', { value: samples });
      const start = performance.now();
      const sample = () => {
        for (const target of document.querySelectorAll<HTMLElement>('.library-surface')) {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(target).transform);
          samples.push({ x: matrix.m41, y: matrix.m42, exiting: target.inert });
        }
        if (performance.now() - start < 1800) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search library' })).toBeVisible();
    if (!reduced) {
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __routeMotion: Array<{ y: number; exiting: boolean }> }
            ).__routeMotion.some(({ y, exiting }) => !exiting && y > 1),
          ),
        )
        .toBe(true);
    }
    await expect(page.locator('.library-surface:not([inert])')).toHaveCSS('transform', 'none');
    const samples = await page.evaluate(
      () =>
        (window as unknown as { __routeMotion: Array<{ x: number; y: number; exiting: boolean }> })
          .__routeMotion,
    );
    if (reduced) expect(samples.every(({ x }) => Math.abs(x) < 0.1)).toBe(true);
    else {
      expect(samples.some(({ y, exiting }) => !exiting && y > 1)).toBe(true);
      expect(samples.every(({ x }) => Math.abs(x) < 0.1)).toBe(true);
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

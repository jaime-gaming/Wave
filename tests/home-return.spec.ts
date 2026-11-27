import { test, expect } from './helpers/returning-user';

for (const reduced of [false, true]) {
  test(`returning Home respects motion and fits the viewport, reduced=${reduced}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.addInitScript(() => localStorage.setItem('wave-animations-enabled', 'true'));
    await page.goto('/Library');
    await expect(page.getByLabel('Import audio files')).toBeEnabled();
    await page.evaluate(() => {
      const samples: number[] = [];
      Object.defineProperty(window, '__homeMotion', { value: samples });
      const sample = () => {
        const surface = document.querySelector<HTMLElement>('.library-surface:not([inert])');
        if (surface?.querySelector('.home-content')) {
          samples.push(new DOMMatrixReadOnly(getComputedStyle(surface).transform).m42);
        }
        if (samples.length < 120) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Home', exact: true })
      .click();
    await expect(page.locator('.home-content')).toBeVisible();
    await expect(page.locator('.library-surface')).toHaveCSS('transform', 'none');
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    const samples = await page.evaluate(
      () => (window as unknown as { __homeMotion: number[] }).__homeMotion,
    );
    if (reduced) expect(samples.every((y) => Math.abs(y) < 0.1)).toBe(true);
    else expect(samples.some((y) => y > 1)).toBe(true);
  });
}

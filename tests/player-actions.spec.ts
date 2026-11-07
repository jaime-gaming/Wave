import { test, expect } from '@playwright/test';
import { wav } from './helpers/audio';
for (const preference of ['enabled', 'system-reduced', 'app-disabled']) {
  test(`player action icons respond without moving their controls: ${preference}`, async ({
    page,
  }) => {
    await page.emulateMedia({
      reducedMotion: preference === 'system-reduced' ? 'reduce' : 'no-preference',
    });
    await page.addInitScript((enabled) => {
      sessionStorage.setItem('wave-booted', '1');
      localStorage.setItem('wave-animations-enabled', String(enabled));
      localStorage.setItem('wave-automatic-lyrics', 'false');
    }, preference !== 'app-disabled');
    await page.route('https://lrclib.net/**', (route) => route.abort());
    await page.route('https://www.youtube.com/**', (route) => route.abort());
    await page.route('https://www.youtube-nocookie.com/**', (route) => route.abort());
    await page.goto('/Library');
    await page
      .getByLabel('Import audio files')
      .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 120) });
    await expect(page.getByRole('status')).toContainText('1 track added');
    await page.getByRole('button', { name: 'Play Signal by Wave Tests', exact: true }).click();
    await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
    const stage = page.getByRole('dialog', { name: 'Now playing', exact: true });
    await expect(stage).toHaveCSS('transform', 'none');
    for (const label of [
      'Repeat: off',
      'Shuffle',
      'Favorite current track',
      'Show video clip',
      'Mute',
    ]) {
      const button = stage.getByRole('button', { name: label, exact: true });
      const handle = await button.elementHandle();
      const before = await handle!.boundingBox();
      await button.evaluate((button) => {
        const glyph = button.querySelector('.player-action-symbol')!;
        const sample = { moved: false, done: false },
          start = performance.now();
        Object.defineProperty(window, '__actionSample', { value: sample, configurable: true });
        const frame = () => {
          sample.moved ||= !new DOMMatrixReadOnly(getComputedStyle(glyph).transform).isIdentity;
          if (performance.now() - start < 420) requestAnimationFrame(frame);
          else sample.done = true;
        };
        requestAnimationFrame(frame);
      });
      await button.click();
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as unknown as { __actionSample: { done: boolean } }).__actionSample.done,
          ),
        )
        .toBe(true);
      expect(
        await page.evaluate(
          () => (window as unknown as { __actionSample: { moved: boolean } }).__actionSample.moved,
        ),
      ).toBe(preference === 'enabled');
      const after = await handle!.boundingBox();
      expect(after!.x).toBeCloseTo(before!.x, 0);
      expect(after!.y).toBeCloseTo(before!.y, 0);
    }
    await expect(stage.getByRole('button', { name: 'Repeat: all', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(stage.getByRole('button', { name: 'Shuffle', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      stage.getByRole('button', { name: 'Unfavorite current track', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(stage.getByRole('slider', { name: 'Volume', exact: true })).toHaveValue('0');
    await stage.getByRole('button', { name: 'Unmute', exact: true }).click();
    await expect(stage.getByRole('slider', { name: 'Volume', exact: true })).not.toHaveValue('0');
  });
}

import { expect, test } from './helpers/returning-user';
import { wav } from './helpers/audio';

test('the player hands off one visible copy of its cover and controls in both directions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 30) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.getByRole('button', { name: 'Play Signal by Wave Tests', exact: true }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();

  const sample = () =>
    page.evaluate(async () => {
      const frames: { duplicates: string[]; coverGhost: boolean; coverReal: boolean }[] = [];
      const selectors = [
        ['.player-morph-art', '.stage-cover'],
        ['.player-morph-control--play', '.stage-play'],
        ['.player-morph-control--title', '.stage-track'],
        ['.player-morph-control--seek', '.stage-transport .wave-seek'],
      ];
      const visible = (element: Element | null) =>
        !!element &&
        getComputedStyle(element).visibility === 'visible' &&
        Number(getComputedStyle(element).opacity) > 0.05;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const frame = () => {
          const dialog = document.querySelector('dialog.player-modal');
          if (dialog) {
            const pairs = selectors.map(([ghost, real]) => [
              visible(dialog.querySelector(ghost)),
              visible(dialog.querySelector(real)),
            ]);
            frames.push({
              duplicates: pairs.flatMap(([ghost, real], i) =>
                ghost && real ? [selectors[i][0]] : [],
              ),
              coverGhost: pairs[0][0],
              coverReal: pairs[0][1],
            });
          }
          if (performance.now() - start < 850) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      return frames;
    });
  const opening = await sample();
  expect(opening.length).toBeGreaterThan(10);
  expect(opening.flatMap((frame) => frame.duplicates)).toEqual([]);
  expect(opening.some((frame) => frame.coverGhost)).toBe(true);
  expect(opening.at(-1)?.coverReal).toBe(true);

  await page
    .getByRole('dialog', { name: 'Now playing' })
    .getByRole('button', { name: 'Close dialog' })
    .click();
  const closing = await sample();
  expect(closing.length).toBeGreaterThan(5);
  expect(closing.flatMap((frame) => frame.duplicates)).toEqual([]);
  expect(closing.some((frame) => frame.coverGhost)).toBe(true);
  await expect(page.locator('dialog.player-modal')).toHaveCount(0);
});

test('closing quickly and resizing never leaves controls hidden or doubled', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 30) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.getByRole('button', { name: 'Play Signal by Wave Tests', exact: true }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await page
    .getByRole('dialog', { name: 'Now playing' })
    .getByRole('button', { name: 'Close dialog' })
    .click();
  await expect(page.locator('dialog.player-modal')).toHaveCount(0);
  await expect(page.locator('.compact-cover-open')).toHaveCSS('visibility', 'visible');
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await page.waitForTimeout(800);
  await page.setViewportSize({ width: 780, height: 700 });
  await page.waitForTimeout(400);
  const dialog = page.locator('dialog.player-modal');
  await expect(dialog.locator('.stage-play')).toBeVisible();
  await expect(dialog.locator('.player-morph-control--play')).toHaveCSS('visibility', 'hidden');
  await expect(dialog.locator('.stage-cover')).toBeVisible();
  await expect(dialog.locator('.player-morph-art')).toHaveCSS('visibility', 'hidden');
});

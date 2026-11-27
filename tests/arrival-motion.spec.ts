import { expect, test } from '@playwright/test';
import { wav } from './helpers/audio';

for (const size of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`Wave logo and guided welcome are visible at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const mark = page.locator('.boot-wordmark .wave-wordmark-full');
    await expect(mark).toBeVisible();
    expect((await mark.boundingBox())!.width).toBeGreaterThan(100);
    await expect(page.getByRole('heading', { name: 'Welcome to Wave' })).toBeVisible();
    await page.getByRole('button', { name: 'Get started' }).click();
    await expect(page.getByRole('heading', { name: 'What should we call you?' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Make it yours' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Find lyrics automatically' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Your sound' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('switch', { name: 'Find lyrics automatically' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
}

test('player surface and artwork travel between the compact and full player', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('wave-welcome-done', 'true'));
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 30) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.getByRole('button', { name: 'Play Signal by Wave Tests', exact: true }).click();
  const bar = page.locator('.player-bar');
  const mini = await bar.locator('.compact-cover-open').boundingBox();
  await bar.getByRole('button', { name: 'Open now playing' }).click();
  const dialog = page.getByRole('dialog', { name: 'Now playing' });
  const flight = page.locator('.player-morph-art');
  await expect(flight).toBeAttached();
  await expect(bar).toHaveClass(/player-cover-morph-source/);
  await expect(bar.locator('.compact-cover-open')).toHaveCSS('visibility', 'hidden');
  await expect(bar.locator('.mini-play')).toHaveCSS('visibility', 'hidden');
  await expect
    .poll(async () => (await flight.boundingBox())?.width ?? 0)
    .toBeGreaterThan(mini!.width + 5);
  await expect(dialog.locator('.stage-cover')).toBeVisible();
  const full = await dialog.locator('.stage-cover').boundingBox();
  expect(full!.width).toBeGreaterThan(mini!.width);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect
    .poll(async () => (await flight.boundingBox())?.width ?? 0)
    .toBeLessThan(full!.width - 5);
  await expect(dialog).toHaveCount(0);
  await expect(bar).toBeVisible();
  await expect(bar.locator('.compact-cover-open')).toHaveCSS('visibility', 'visible');
  await expect(bar.locator('.mini-play')).toHaveCSS('visibility', 'visible');
});

test('reduced motion keeps the player usable without a flying cover', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('wave-welcome-done', 'true'));
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 5) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.getByRole('button', { name: 'Play Signal by Wave Tests', exact: true }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(page.getByRole('dialog', { name: 'Now playing' })).toBeVisible();
  await expect(page.locator('.player-morph-art')).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`seek travels with the player at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => localStorage.setItem('wave-welcome-done', 'true'));
    await page.goto('/');
    await page
      .getByLabel('Import audio files')
      .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 20) });
    await expect(page.getByRole('status')).toContainText('1 track added');
    await page.getByRole('button', { name: 'Play Signal by Wave Tests', exact: true }).click();
    await page.getByRole('button', { name: 'Open now playing' }).click();
    const seek = page.locator('.player-morph-control--seek');
    await expect(seek).toBeAttached();
    await expect(seek.locator('svg')).toBeVisible();
    await expect(page.locator('dialog.player-modal .stage-transport .wave-seek')).toBeVisible();
    const input = page.locator('dialog.player-modal .stage-transport input[aria-label="Seek"]');
    await expect.poll(async () => Number(await input.inputValue())).toBeGreaterThan(0);
    await page
      .getByRole('dialog', { name: 'Now playing' })
      .getByRole('button', { name: 'Close dialog' })
      .click();
    await expect(seek.locator('svg')).toBeVisible();
    expect(Number(await seek.locator('input').inputValue())).toBeGreaterThan(0);
    await expect
      .poll(async () =>
        Number(
          await page
            .locator('dialog.player-modal > .player-normal-view')
            .evaluate((el) => getComputedStyle(el).opacity),
        ),
      )
      .toBeLessThan(0.5);
    await expect(page.locator('dialog.player-modal')).toHaveCount(0);
  });
}

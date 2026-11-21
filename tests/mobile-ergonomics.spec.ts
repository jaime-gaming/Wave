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

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`portrait now playing keeps its record and controls usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem('wave-animations-enabled', 'false');
      localStorage.setItem('wave-mix-v2', 'false');
      localStorage.setItem('wave-autoplay', 'false');
    });
    await page.goto('/');
    const { wav } = await import('./helpers/audio');
    await page.getByLabel('Import audio files').setInputFiles({
      name: 'Signal.wav',
      mimeType: 'audio/wav',
      buffer: wav('Signal', 120),
    });
    await expect(page.getByRole('status')).toContainText('1 track added');
    await page.getByRole('button', { name: 'Play Signal by Wave Tests', exact: true }).click();
    await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
    const player = page.getByRole('dialog', { name: 'Now playing', exact: true });
    const cover = player.locator('.stage-cover');
    const track = player.locator('.stage-track');
    const deck = player.locator('.stage-transport');
    const seek = player.getByRole('slider', { name: 'Seek' });
    const lyrics = player.locator('.stage-lyrics');
    for (const open of [true, false]) {
      await expect(lyrics).toHaveAttribute('data-open', String(open));
      const boxes = await Promise.all([cover, track, deck, seek].map((item) => item.boundingBox()));
      const [art, title, controls, slider] = boxes.map((box) => box!);
      expect(Math.abs(art.width - art.height)).toBeLessThan(2);
      expect(Math.abs(art.x + art.width / 2 - viewport.width / 2)).toBeLessThan(4);
      expect(title.y).toBeGreaterThanOrEqual(art.y + art.height - 1);
      expect(slider.y).toBeGreaterThanOrEqual(controls.y);
      expect(controls.y + controls.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(
        await player.evaluate(
          (el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth,
        ),
      ).toBe(true);
      if (open) await player.getByRole('button', { name: 'Lyrics', exact: true }).click();
    }
    await player.getByRole('button', { name: 'Lyrics', exact: true }).click();
    await player.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });
}

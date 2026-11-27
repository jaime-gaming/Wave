import { test, expect, type Page } from './helpers/returning-user';
import { wav } from './helpers/audio';

const CLIP_KEY = 'wave-video-clips-v1';

async function setup(page: Page) {
  await page.route('https://lrclib.net/api/**', (route) =>
    route.fulfill({ status: 404, body: '{}' }),
  );

  await page.route('https://www.youtube.com/**', (route) => route.abort());
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.abort());
  await page.addInitScript(() => localStorage.setItem('wave-video-clip', 'true'));
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 120) });
  await expect(page.getByRole('status')).toContainText('1 track added');

  const id = await page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('wave-library');
      request.onsuccess = () => resolve(request.result);
    });
    const track = await new Promise<{ id: string }>((resolve, reject) => {
      const request = db.transaction('tracks').objectStore('tracks').getAll();
      request.onsuccess = () => resolve(request.result[0] as { id: string });
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('tracks', 'readwrite');
    tx.objectStore('tracks').put({
      ...track,
      lyrics: {
        raw: '[00:00]A quiet room, a song to follow\n[00:30]The next line stays with the music\n[01:00]Back to the beginning',
        source: 'local',
        offsetMs: 0,
        lines: [],
      },
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem(
      key,
      JSON.stringify({
        [track.id]: { videoId: 'dQw4w9WgXcQ', startAt: 0, addedAt: Date.now(), duration: 0 },
      }),
    );
    return track.id;
  }, CLIP_KEY);
  expect(id).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Play Signal by Wave Tests', exact: true }).click();
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  const stage = page.getByRole('dialog', { name: 'Now playing', exact: true });
  await expect(stage).toBeVisible();

  await expect(page.locator('.player-normal-view.clip-live')).toHaveCount(1, { timeout: 15_000 });
  return stage;
}

const boxes = (page: Page) =>
  page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    return {
      cover: rect('.stage-cover'),
      record: rect('.stage-record'),
      lyrics: rect('.stage-lyrics'),
      controls: rect('.stage-controls'),
      backdrop: rect('.video-backdrop'),
      modal: rect('.player-modal'),
      track: rect('.stage-track'),

      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    };
  });

for (const [width, height] of [
  [1440, 900],
  [1280, 720],
]) {
  test(`the clip view keeps its sleeve, its words and its transport apart at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const stage = await setup(page);

    await expect(stage.locator('.stage-track h3')).toHaveText('Signal');
    await expect(stage.locator('.stage-metadata .metadata-link')).toHaveCount(2);
    await expect(stage.locator('.stage-track h3')).toBeVisible();

    await page.waitForTimeout(600);

    for (const closed of [false, true]) {
      if (closed) {
        await stage.locator('.stage-lyrics-toggle').click();
        await expect(stage.locator('.stage-lyrics')).toHaveAttribute('data-open', 'false');

        await page.waitForTimeout(300);
      }
      const layout = await boxes(page);

      const corners = (box: { left: number; top: number; right: number; bottom: number } | null) =>
        box ? [box.left, box.top, box.right, box.bottom].map(Math.round).join(',') : 'none';
      const seen = `backdrop ${corners(layout.backdrop)} room ${corners(layout.modal)} window ${layout.width}x${layout.height}`;
      expect(layout.cover, 'the sleeve is drawn').not.toBeNull();
      expect(layout.lyrics, 'the words have their own place').not.toBeNull();
      expect(layout.cover!.width).toBeGreaterThan(110);
      expect(layout.cover!.height).toBeGreaterThan(110);

      if (closed) expect(layout.lyrics!.width).toBeLessThan(180);
      else expect(layout.lyrics!.width).toBeGreaterThan(180);

      expect(layout.controls!.bottom, seen).toBeLessThanOrEqual(layout.height + 2);

      expect(layout.record!.top).toBeLessThan(layout.height * 0.5);
      expect(layout.record!.left).toBeLessThan(layout.width * 0.25);
      expect(layout.lyrics!.bottom).toBeGreaterThan(layout.height * 0.35);
      expect(layout.lyrics!.left).toBeGreaterThan(layout.width * 0.5);
      expect(layout.record!.bottom, seen).toBeLessThanOrEqual(layout.lyrics!.top + 1);

      expect(layout.track!.bottom, seen).toBeLessThanOrEqual(layout.lyrics!.top + 1);

      expect(layout.backdrop!.left, seen).toBeLessThanOrEqual(0.5);
      expect(layout.backdrop!.top, seen).toBeLessThanOrEqual(0.5);
      expect(layout.backdrop!.right, seen).toBeGreaterThanOrEqual(layout.width - 0.5);
      expect(layout.backdrop!.bottom, seen).toBeGreaterThanOrEqual(layout.height - 0.5);

      const paint = await page.evaluate(() => {
        const backdrop = document.querySelector('.video-backdrop');
        const modal = document.querySelector('.player-modal');
        return {
          backdrop: backdrop && getComputedStyle(backdrop).backgroundColor,
          modal: modal && getComputedStyle(modal).backgroundColor,
        };
      });
      expect(paint.backdrop).toBe(paint.modal);
    }
  });
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [667, 375],
]) {
  test(`an idle videoclip keeps playing and wakes at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    if (width !== 1440) await page.emulateMedia({ reducedMotion: 'reduce' });
    test.setTimeout(50_000);
    const stage = await setup(page);
    const originalFrame = await page.locator('.video-backdrop iframe').elementHandle();

    if (width !== 1440) {
      await page.clock.install();
      await page.clock.fastForward(65_000);
    }
    await expect(stage).toHaveClass(/is-idle/, { timeout: 35_000 });
    await expect(stage.locator('.immersive-stage.with-video')).toBeVisible();
    const sleeve = await stage.locator('.immersive-cover').boundingBox();
    expect(sleeve!.width / sleeve!.height).toBeCloseTo(1, 1);
    await expect(stage.locator('.lyrics-cinematic')).toBeVisible();
    expect(await originalFrame!.evaluate((node) => node.isConnected)).toBe(true);
    const background = await page.locator('.video-backdrop').boundingBox();
    const room = await stage.boundingBox();
    expect(background!.height).toBeGreaterThanOrEqual(room!.height - 2);
    expect(background!.width).toBeGreaterThanOrEqual(room!.width - 2);
    const credits = await stage.locator('.immersive-art').boundingBox();
    expect(credits!.y).toBeGreaterThan(room!.height / 2);
    expect(sleeve!.width).toBeLessThanOrEqual(80);
    if (width < 600) {
      const lyrics = await stage.locator('.lyrics-cinematic').boundingBox();
      expect(lyrics!.y + lyrics!.height).toBeLessThanOrEqual(credits!.y);
    }
    await expect(stage.locator('.player-normal-view')).toHaveCSS('visibility', 'hidden');
    await expect(page.locator('.video-backdrop')).toHaveCount(1);
    await page.mouse.move(80, 80);
    await expect(stage).not.toHaveClass(/is-idle/);
    await expect(stage.locator('.stage-controls')).toHaveCSS('opacity', '1');
    await expect(page.locator('.player-normal-view.clip-live')).toHaveCount(1);
  });
}

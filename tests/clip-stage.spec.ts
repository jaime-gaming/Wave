import { test, expect, type Page } from '@playwright/test';
import { wav } from './helpers/audio';

/**
 * The clip view, measured.
 *
 * The picture is the stage, and everything Wave draws sits *around* it: the
 * sleeve and the song's text on the left, the words of the song on the right,
 * one transport at the foot. That only works if the sleeve is a real size and
 * the two side blocks stay out of each other, which is exactly what went wrong
 * when the rules for a closed lyric reader were still in charge of this view —
 * the sleeve collapsed to a thumbnail and the words landed on top of the record.
 *
 * A screenshot would not catch that; a rectangle does.
 */
const CLIP_KEY = 'wave-video-clips-v1';

async function setup(page: Page) {
  await page.route('https://lrclib.net/api/**', (route) =>
    route.fulfill({ status: 404, body: '{}' }),
  );
  // The embed itself is not under test: the backdrop reveals itself either way,
  // and asking YouTube for a video would make this depend on the network.
  await page.route('https://www.youtube.com/**', (route) => route.abort());
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.abort());
  await page.addInitScript(() => localStorage.setItem('wave-video-clip', 'true'));
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 120) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  // The clip is stored against the song's id, which the library owns.
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
  // The backdrop reveals itself as soon as it hears from the player, and after
  // six seconds regardless, so this is bounded.
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
      width: innerWidth,
      height: innerHeight,
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
    // The song's own text is still there: it is the reason the sleeve exists.
    await expect(stage.locator('.stage-track h3')).toHaveText('Signal');
    await expect(stage.locator('.stage-metadata .metadata-link')).toHaveCount(2);
    await expect(stage.locator('.stage-track h3')).toBeVisible();

    for (const closed of [false, true]) {
      if (closed) await stage.locator('.stage-lyrics-toggle').click();
      const layout = await boxes(page);
      expect(layout.cover, 'the sleeve is drawn').not.toBeNull();
      expect(layout.lyrics, 'the words have their own column').not.toBeNull();
      expect(layout.cover!.width).toBeGreaterThan(110);
      expect(layout.cover!.height).toBeGreaterThan(110);
      // The record and the words share the row without touching.
      expect(layout.record!.right).toBeLessThanOrEqual(layout.lyrics!.left + 1);
      expect(layout.lyrics!.width).toBeGreaterThan(180);
      // Nothing hangs below the window.
      expect(layout.controls!.bottom).toBeLessThanOrEqual(layout.height + 1);
      // The picture is still visible in the middle: the record ends early and
      // the words begin late.
      expect(layout.lyrics!.left).toBeGreaterThan(layout.width * 0.55);
    }
  });
}

test('closing the words does not shrink the sleeve or move it under the words', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const stage = await setup(page);
  const open = await boxes(page);
  await stage.locator('.stage-lyrics-toggle').click();
  await expect(stage.locator('.stage-lyrics')).toHaveAttribute('data-open', 'false');
  const closed = await boxes(page);
  expect(closed.cover!.width).toBeCloseTo(open.cover!.width, 0);
  expect(closed.record!.left).toBeCloseTo(open.record!.left, 0);
  expect(closed.lyrics!.right).toBeLessThanOrEqual(closed.width);
  expect(closed.lyrics!.width).toBeLessThan(open.lyrics!.width);
});

import { test, expect } from '@playwright/test';
import { wav } from './helpers/audio';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wave-animations-enabled', 'false');
    localStorage.setItem('wave-editor-enabled', 'true');
    localStorage.setItem('wave-automatic-lyrics', 'false');
  });
  await page.route('https://lrclib.net/**', (route) => route.abort());
  await page.goto('/Library');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 30) });
  await expect(page.getByRole('status')).toContainText('1 track added');
});

test('routes survive reload and browser back', async ({ page }) => {
  await page.getByRole('button', { name: 'Remix', exact: true }).click();
  await expect(page).toHaveURL(/\/Remix$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No week to look back on yet' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/Library$/);
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 800 },
  { width: 667, height: 375 },
]) {
  test(`trim edges and hold-zoom work at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Options for Signal' }).click();
    await page.getByRole('button', { name: 'Edit song', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit song', exact: true });
    await expect(editor.getByRole('slider')).toHaveCount(0);
    await editor.getByRole('button', { name: /Trim audio/ }).click();
    const trim = page.getByRole('dialog', { name: 'Trim audio', exact: true });
    await expect(trim.locator('audio[controls]')).toHaveCount(0);
    await expect(trim.locator('input[type=number]')).toHaveCount(0);
    await expect(trim.locator('svg line').first()).toBeAttached();
    const listen = trim.getByRole('button', { name: 'Listen to selection' });
    expect((await listen.boundingBox())!.height).toBeLessThan(70);
    expect((await listen.locator('svg').boundingBox())!.width).toBeLessThanOrEqual(20);
    const start = trim.getByRole('slider', { name: 'Trim start' });
    const box = await start.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect(trim.locator('.is-zoomed')).toBeVisible();
    await page.mouse.move(box!.x + 65, box!.y + box!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(trim.locator('.is-zoomed')).toHaveCount(0);
    expect(Number(await start.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    await trim.getByRole('button', { name: 'Save changes' }).click();
    await expect(trim).toHaveCount(0);
    const saved = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const req = indexedDB.open('wave-library');
        req.onsuccess = () => resolve(req.result);
      });
      const tracks = await new Promise<Array<{ trim?: { start: number } }>>((resolve) => {
        const req = db.transaction('tracks').objectStore('tracks').getAll();
        req.onsuccess = () => resolve(req.result);
      });
      db.close();
      return tracks[0].trim;
    });
    expect(saved?.start).toBeGreaterThan(0);
  });
}

for (const width of [360, 1280]) {
  test(`Remix highlights fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const req = indexedDB.open('wave-library');
        req.onsuccess = () => resolve(req.result);
      });
      const tx = db.transaction(['tracks', 'plays'], 'readwrite');
      const req = tx.objectStore('tracks').getAll();
      req.onsuccess = () =>
        tx.objectStore('plays').put({
          id: 'test-play',
          trackId: req.result[0].id,
          at: Date.now(),
          seconds: 4000,
          completed: true,
        });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    await page.goto('/Remix');
    await expect(page.getByRole('button', { name: /Listening time/ })).toContainText('1 h');
    await expect(page.getByRole('button', { name: /Top artist/ })).toContainText('Wave Tests');
    await page.getByRole('button', { name: /Top song/ }).click();
    await expect(page.locator('#remix-song-panel')).toContainText('Signal');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

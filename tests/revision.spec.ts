import { settingsMenu, closeSettings } from './helpers/settings';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('wave-mix-v2') === null) localStorage.setItem('wave-mix-v2', 'false');
    if (localStorage.getItem('wave-autoplay') === null)
      localStorage.setItem('wave-autoplay', 'false');
  });
});

function audio() {
  const buffer = Buffer.alloc(44 + 16000 * 30);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(buffer.length - 44, 40);
  return { name: 'Signal.wav', mimeType: 'audio/wav', buffer };
}
test('fresh Home, real Settings page, consent off and lyrics reopen on expansion', async ({
  page,
}) => {
  let requests = 0;
  await page.route('https://lrclib.net/api/**', (route) => {
    requests++;
    return route.fulfill({ status: 404, body: '{}' });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Lyrics');
  const settings = page.getByRole('region', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(settings.getByRole('switch', { name: 'Automatic lyrics' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await closeSettings(page);
    await expect(page.getByRole('button', { name: 'Open settings' })).toBeFocused();
    await page.getByRole('button', { name: 'Open settings' }).click();
  }
  await closeSettings(page);
  await page.getByLabel('Import audio files').setInputFiles(audio());
  await page.getByRole('button', { name: 'Play Signal by Unknown artist' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  const disclosure = full.locator('.stage-lyrics');
  await expect(disclosure).toHaveAttribute('data-open', 'true');
  await disclosure.getByRole('button', { name: 'Lyrics', exact: true }).click();
  await expect(disclosure).not.toHaveAttribute('data-open', 'true');
  await full.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('dialog').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(disclosure).toHaveAttribute('data-open', 'true');
  expect(requests).toBe(0);
});
test('explicit duplicate scan merges only byte-equal legacy copies and preserves local data', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles(audio());
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('wave-library');
      req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction(['tracks', 'playlists', 'albumOrders'], 'readwrite');
    const req = tx.objectStore('tracks').getAll();
    req.onsuccess = () => {
      const track = req.result[0];
      tx.objectStore('tracks').put({
        ...track,
        id: 'duplicate',
        favorite: true,
        lyrics: { raw: '[00:00]Local words', source: 'local', offsetMs: 0, lines: [] },
      });
      tx.objectStore('tracks').put({
        ...track,
        id: 'edition',
        album: 'Other edition',
        blob: new Blob(['different recording']),
        size: 19,
      });
      tx.objectStore('playlists').put({
        id: 'list',
        name: 'List',
        description: '',
        createdAt: 1,
        updatedAt: 1,
        trackIds: ['duplicate', track.id],
      });
      tx.objectStore('albumOrders').put({ id: 'album', trackIds: ['duplicate', track.id] });
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('region', { name: 'Settings' });
  await settingsMenu(page, 'Storage');
  await settings.getByRole('button', { name: 'Scan duplicate files' }).click();
  await expect(settings.getByRole('status').filter({ hasText: 'identical groups' })).toContainText(
    '1 identical groups',
  );
  await settings.getByRole('button', { name: 'Merge identical copies' }).click();
  await expect(settings.getByRole('status').filter({ hasText: 'Identical copies' })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('wave-library');
      req.onsuccess = () => resolve(req.result);
    });
    const get = (store: string) =>
      new Promise<Array<Record<string, unknown>>>((resolve) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
      });
    const tracks = await get('tracks'),
      playlists = await get('playlists'),
      orders = await get('albumOrders');
    db.close();
    return {
      tracks: tracks.map((t) => ({
        id: t.id,
        favorite: t.favorite,
        lyrics: (t.lyrics as { raw?: string } | undefined)?.raw,
      })),
      playlists,
      orders,
    };
  });
  expect(saved.tracks).toHaveLength(2);
  expect(saved.tracks.find((t) => t.id !== 'edition')).toMatchObject({
    favorite: true,
    lyrics: '[00:00]Local words',
  });
  expect(saved.playlists[0].trackIds).toHaveLength(1);
  expect(saved.orders[0].trackIds).toEqual(saved.playlists[0].trackIds);
  expect(saved.tracks.some((t) => t.id === 'edition')).toBe(true);
});

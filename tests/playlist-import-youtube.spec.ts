import { test, expect } from './helpers/returning-user';
import { wav } from './helpers/audio';

test('imports a reviewed YouTube playlist and combines its song when the local file arrives', async ({
  page,
}) => {
  await page.route('**/api/youtube-search', async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            videoId: 'dQw4w9WgXcQ',
            title: 'Wave Tests - Signal',
            author: 'Wave Tests',
            duration: 8,
          },
        ],
      },
    });
  });
  await page.goto('/Library/Playlists');
  await page.getByRole('button', { name: 'Bring playlists over' }).click();
  const modal = page.getByRole('dialog', { name: 'Bring your playlists over' });
  await modal
    .getByRole('textbox', { name: 'Playlist, song list or link' })
    .fill('Wave Tests - Signal');
  await modal.getByRole('button', { name: 'Read this list' }).click();
  await expect(modal.getByText('1 of 1 songs ready')).toBeVisible();
  await modal.getByRole('button', { name: 'Create playlist with 1' }).click();
  await expect(modal.getByText('Your playlist is ready')).toBeVisible();
  await modal.getByRole('button', { name: 'Back to playlists' }).click();
  const records = async () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('wave-library');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const result = await new Promise<
        Array<{ id: string; source: string; youtubeOnly: boolean; blob?: Blob }>
      >((resolve, reject) => {
        const request = db.transaction('tracks').objectStore('tracks').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return result.map((item) => ({
        id: item.id,
        source: item.source,
        youtubeOnly: item.youtubeOnly,
        size: item.blob?.size ?? 0,
      }));
    });
  expect(await records()).toEqual([
    { id: 'yt-playlist-dQw4w9WgXcQ', source: 'youtube', youtubeOnly: true, size: 0 },
  ]);
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 8) });
  await expect.poll(async () => (await records())[0]?.source).toBe('local');
  expect(await records()).toEqual([
    expect.objectContaining({
      id: 'yt-playlist-dQw4w9WgXcQ',
      source: 'local',
      youtubeOnly: false,
      size: expect.any(Number),
    }),
  ]);
  expect((await records())[0].size).toBeGreaterThan(0);
});

test('YouTube searches never add an outdated or unselected result', async ({ page }) => {
  await page.route('**/api/youtube-search', async (route) => {
    const request = route.request().postDataJSON() as { q: string };
    const first = request.q.toLowerCase().includes('first');
    await route.fulfill({
      json: {
        items: [
          {
            videoId: first ? 'dQw4w9WgXcQ' : '9bZkp7q19f0',
            title: first ? 'First song' : 'Second song',
            author: 'Wave Tests',
            duration: 8,
          },
        ],
      },
    });
  });
  await page.goto('/');
  await page.locator('.header-actions .add-menu-trigger').click();
  await page.locator('.header-actions').getByRole('button', { name: 'Add from YouTube' }).click();
  const modal = page.getByRole('dialog', { name: 'Add music' });
  const input = modal.getByRole('textbox');
  await input.fill('First song');
  await expect(modal.getByRole('button', { name: /First song/ })).toBeVisible();
  await input.fill('Second song');
  await expect(modal.getByRole('button', { name: /First song/ })).toHaveCount(0);
  await input.press('Enter');
  await expect(modal.getByRole('button', { name: /Second song/ })).toBeVisible();
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: /Second song/ }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Second song/ }).first()).toBeVisible();
});

test('a playlist match can be corrected before saving on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/youtube-search', async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            videoId: 'dQw4w9WgXcQ',
            title: 'Wave Tests - Signal',
            author: 'Wave Tests',
            duration: 8,
          },
        ],
      },
    });
  });
  await page.route('**/api/youtube-meta**', async (route) => {
    await route.fulfill({
      json: { title: 'Wave Tests - Corrected', author: 'Wave Tests', duration: 9 },
    });
  });
  await page.goto('/Library/Playlists');
  await page.getByRole('button', { name: 'Bring playlists over' }).click();
  const modal = page.getByRole('dialog', { name: 'Bring your playlists over' });
  await modal
    .getByRole('textbox', { name: 'Playlist, song list or link' })
    .fill('Wave Tests - Signal');
  await modal.getByRole('button', { name: 'Read this list' }).click();
  await modal.getByRole('button', { name: 'Change match for Signal' }).click();
  const create = modal.getByRole('button', { name: 'Create playlist with 1' });
  await expect(create).toBeDisabled();
  await modal
    .getByRole('textbox', { name: 'YouTube video link for Signal' })
    .fill('https://youtu.be/9bZkp7q19f0');
  await modal.getByRole('button', { name: 'Use this video' }).click();
  await expect(modal.getByText(/Corrected/)).toBeVisible();
  await expect(modal.getByRole('link', { name: 'Open Signal on YouTube' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=9bZkp7q19f0',
  );
  await expect(create).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await create.click();
  await expect(modal.getByText('Your playlist is ready')).toBeVisible();
});

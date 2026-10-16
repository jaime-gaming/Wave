import { test, expect, type Page } from '@playwright/test';
import { wav } from './helpers/audio';
import { settingsMenu, closeSettings } from './helpers/settings';
async function library(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
}
async function bounded(page: Page, selector: string) {
  const violations = await page.locator(selector).evaluateAll((elements) =>
    elements
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
      })
      .map((el) => ({ tag: el.tagName, cls: el.className, text: el.textContent?.slice(0, 45) })),
  );
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wave-animations-enabled', 'false');
    localStorage.setItem('wave-auto-lyrics', 'false');
  });
  await page.route('https://lrclib.net/api/**', (r) => r.fulfill({ status: 404, body: '{}' }));
});
test('removed catalogue cannot make requests even with legacy consent; local tags and previously saved details remain', async ({
  page,
}) => {
  let requests = 0;
  await page.route(/https:\/\/(musicbrainz\.org|coverartarchive\.org|archive\.org)\//, (r) => {
    requests++;
    return r.abort();
  });
  await page.addInitScript(() => localStorage.setItem('wave-metadata-consent-v1', 'true'));
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles({
    name: 'Local.wav',
    mimeType: 'audio/wav',
    buffer: wav('Local', 60, 8000, 16, 'Wave Tests', ''),
  });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Library management');
  await expect(page.getByRole('region', { name: 'Local metadata' })).toContainText(
    'Missing: album, artwork',
  );
  await expect(page.getByRole('switch', { name: 'Verify metadata online' })).toHaveCount(0);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('wave-library');
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction('tracks', 'readwrite'),
      store = tx.objectStore('tracks'),
      r = store.getAll();
    r.onsuccess = () =>
      store.put({
        ...r.result[0],
        album: 'Saved edition',
        metadataCheck: { status: 'matched', candidate: { album: 'Unused suggestion' } },
      });
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    db.close();
  });
  await page.reload();
  await library(page);
  await expect(page.locator('.album-name')).toHaveAttribute('title', 'Saved edition');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Library management');
  await expect(page.getByRole('region', { name: 'Local metadata' })).toContainText(
    'Missing: artwork',
  );
  expect(requests).toBe(0);
});
test('six settings menus isolate controls, preserve preferences, restore keyboard focus and fit phone widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.getByRole('contentinfo', { name: 'Music player' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Open settings' }).click();
  const hub = page.getByRole('region', { name: 'Settings', exact: true });
  await expect(hub.locator('.settings-menu-item')).toHaveCount(6);
  await expect(hub.getByRole('switch')).toHaveCount(0);
  for (const menu of [
    'Appearance',
    'Playback',
    'Lyrics',
    'Library management',
    'Storage',
    'About Wave',
  ]) {
    await settingsMenu(page, menu);
    await expect(hub.getByRole('heading', { name: menu, exact: true })).toBeFocused();
    await bounded(
      page,
      '.settings-page-options,.settings-menu-item,.theme-options button,.settings-switch-row,.settings-source',
    );
    if (menu === 'Appearance')
      await hub.getByRole('button', { name: 'Light', exact: true }).click();
    if (menu === 'Playback')
      await hub.getByRole('switch', { name: 'Autoplay', exact: true }).click();
    await hub.getByRole('button', { name: 'Back to settings' }).click();
    await expect(hub.getByRole('button', { name: menu, exact: true })).toBeFocused();
  }
  await closeSettings(page);
  await expect(page.getByRole('button', { name: 'Open settings' })).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Playback');
  await expect(hub.getByRole('switch', { name: 'Autoplay', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});
test('library categories, song rows, menus and full player contain very long unbroken metadata at every width', async ({
  page,
}) => {
  test.setTimeout(60000);
  const title = 'VeryLongUnbrokenTitle'.repeat(23),
    artist = 'ArtistWithoutAnySpaces'.repeat(22),
    album = 'LongUnbrokenAlbumName'.repeat(23);
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles([
    { name: 'Long.wav', mimeType: 'audio/wav', buffer: wav(title, 90, 8000, 16, artist, album) },
    { name: 'Short.wav', mimeType: 'audio/wav', buffer: wav('Short', 90) },
  ]);
  await expect(page.getByRole('status')).toContainText('2 tracks added');
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await library(page);
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    for (const name of ['Songs', 'Albums', 'Artists', 'Playlists', 'Favorites'])
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await bounded(
      page,
      '.library-tabs button,.song-row,.song-title-button,.song-name,.song-name strong,.song-artist-link,.sort-control,.song-actions',
    );
    await expect(page.locator('.song-row .song-name strong').filter({ hasText: title })).toHaveText(
      title,
    );
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'Albums', exact: true }).click();
  await bounded(page, '.album-card,.album-card strong');
  await page.getByRole('button', { name: `${album} ${artist}`, exact: true }).click();
  await bounded(page, '.group-heading,.group-heading h2,.song-row');
  await page.getByRole('button', { name: 'Artists', exact: true }).click();
  await bounded(page, '.artist-card,.artist-card strong');
  await page.getByRole('button', { name: `${artist} 1 song · 1 album`, exact: true }).click();
  await bounded(page, '.artist-detail,.artist-detail h2,.artist-actions,.artist-actions button');
  await library(page);
  await page.getByRole('button', { name: `Options for ${title}`, exact: true }).click();
  await bounded(page, '.options-track,.options-track .track-info,.options-action');
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: `Play ${title} by ${artist}`, exact: true }).click();
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  await bounded(page, '.stage-track,.stage-track h3,.stage-metadata,.stage-controls,.player-modal');
  const full = page.getByRole('dialog', { name: 'Now playing', exact: true });
  expect(await full.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await full.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Show queue', exact: true }).click();
  await bounded(
    page,
    '.queue-entry,.queue-entry__play,.queue-entry__info,.queue-entry__info strong',
  );
  await page
    .getByRole('dialog', { name: 'Queue', exact: true })
    .getByRole('button', { name: 'Close dialog' })
    .click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await page.getByRole('searchbox').fill('VeryLongUnbrokenTitle');
  await bounded(page, '.song-row,.search-page,.search-composer');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Home', exact: true })
    .click();
  await bounded(page, '.home-session,.home-session strong,.home-playlist,.artist-card');
  // Album shelves intentionally scroll horizontally; labels must still fit their own cards.
  expect(
    await page
      .locator('.album-card strong')
      .evaluateAll((labels) =>
        labels.every(
          (label) =>
            label.getBoundingClientRect().width <=
            label.parentElement!.getBoundingClientRect().width + 1,
        ),
      ),
  ).toBe(true);
});
test('long playlist names and descriptions wrap in detail and clamp in cards without decorative effects', async ({
  page,
}) => {
  const name = 'UnbrokenPlaylistName'.repeat(5);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await library(page);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create playlist', exact: true });
  await dialog.getByLabel('Playlist name').fill(name);
  await dialog.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await expect(page.locator('.playlist-detail h2')).toHaveText(name);
  await bounded(
    page,
    '.playlist-detail,.playlist-detail-copy,.playlist-detail h2,.playlist-detail-actions',
  );
  const image = await page.locator('.playlist-detail .artwork img').getAttribute('src');
  expect(decodeURIComponent(image!)).not.toMatch(/gradient|rotate\(|<filter|radial/i);
  await page.getByRole('button', { name: 'Back to playlists', exact: true }).click();
  await bounded(page, '.playlist-card,.playlist-card strong');
  await expect(page.locator('.playlist-card strong')).toHaveText(name);
  const description = 'LongDescriptionWithoutSpaces'.repeat(35);
  await page.evaluate(async (description) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('wave-library');
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction('playlists', 'readwrite'),
      store = tx.objectStore('playlists'),
      r = store.getAll();
    r.onsuccess = () => store.put({ ...r.result[0], description });
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    db.close();
  }, description);
  await page.reload();
  await library(page);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.locator('.playlist-card').click();
  await expect(page.locator('.playlist-description')).toHaveText(description);
  await bounded(page, '.playlist-detail,.playlist-description,.playlist-detail-copy');
});

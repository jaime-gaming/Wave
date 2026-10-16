import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('wave-mix-v2') === null) localStorage.setItem('wave-mix-v2', 'false');
    if (localStorage.getItem('wave-autoplay') === null)
      localStorage.setItem('wave-autoplay', 'false');
  });
});

import { wav } from './helpers/audio';
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://lrclib.net/api/**', (r) => r.fulfill({ status: 404, body: '{}' }));
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles([
    {
      name: 'song.wav',
      mimeType: 'audio/wav',
      buffer: wav('Déjà Vu', 120, 8000, 16, 'Beyoncé', 'B-Day'),
    },
    { name: 'other.wav', mimeType: 'audio/wav', buffer: wav('Night', 120) },
  ]);
  await expect(page.getByRole('status')).toContainText('2 tracks added');
});
test('global search lives on its own page and handles accents, token order and categories', async ({
  page,
}) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(page.getByLabel('Search library')).toHaveCount(0);
  await nav.getByRole('button', { name: 'Search', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search library' });
  await expect(search).toBeFocused();
  await search.fill('vu beyonce deja');
  await expect(page.getByRole('button', { name: 'Play Déjà Vu by Beyoncé' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Night by Wave Tests' })).toHaveCount(0);
  await search.fill('beyonce');
  await expect(page.getByRole('region', { name: 'Artist results' })).toContainText('Beyoncé');
  await expect(page.getByRole('region', { name: 'Album results' })).toContainText('B-Day');
  await page.getByRole('button', { name: 'Artists', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Song results' })).toHaveCount(0);
  await page
    .getByRole('region', { name: 'Artist results' })
    .getByRole('button', { name: 'Beyoncé 1 songs' })
    .click();
  await expect(page.getByRole('heading', { name: 'Beyoncé', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByLabel('Search library')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(search).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
test('Library has no repeated filter and global search remains on Search', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByLabel('Search library')).toHaveCount(0);
  await expect(page.getByPlaceholder('Filter this collection')).toHaveCount(0);
  await nav.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search library' }).fill('beyonce vu');
  await expect(page.getByRole('button', { name: 'Play Déjà Vu by Beyoncé' })).toBeVisible();
  await nav.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Night by Wave Tests' })).toBeVisible();
});
test('filename fallback becomes usable metadata and tagged identities still take precedence', async ({
  page,
}) => {
  await page.getByLabel('Import audio files').setInputFiles({
    name: '01 - Wrong Artist — Wrong Song.wav',
    mimeType: 'audio/wav',
    buffer: wav('Actual Song', 120, 8000, 16, 'Actual Artist'),
  });
  await expect(
    page.getByRole('button', { name: 'Play Actual Song by Actual Artist' }),
  ).toBeVisible();
  await page.getByLabel('Import audio files').setInputFiles({
    name: '02 - Local Artist — Local Song (Live).wav',
    mimeType: 'audio/wav',
    buffer: wav('', 120, 8000, 16, '', ''),
  });
  await expect(
    page.getByRole('button', { name: 'Play Local Song (Live) by Local Artist' }),
  ).toBeVisible();
});
test('playlist category finds accent-insensitive names and its create action opens the real editor', async ({
  page,
}) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  let editor = page.getByRole('dialog', { name: 'Create playlist', exact: true });
  await editor.getByLabel('Playlist name').fill('Música de noche');
  await editor.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await nav.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search library' }).fill('noche musica');
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Playlists' })).toContainText('Música de noche');
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'Create playlist', exact: true });
  await expect(editor).toBeVisible();
});

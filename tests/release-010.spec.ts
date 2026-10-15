import { test, expect, type Page } from '@playwright/test';
import { wav } from './helpers/audio';
import { settingsMenu, closeSettings } from './helpers/settings';
async function edit(page: Page) {
  await page.getByRole('button', { name: 'Options for Signal', exact: true }).click();
  await page.getByRole('button', { name: 'Edit lyrics', exact: true }).click();
  return page.getByRole('dialog', { name: 'Edit lyrics', exact: true });
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wave-animations-enabled', 'false');
    localStorage.setItem('wave-mix-v2', 'false');
    localStorage.setItem('wave-autoplay', 'false');
  });
});
test('Edit lyrics searches an unplayed song with explicit preview/save and survives reload without starting audio', async ({
  page,
}) => {
  let requests = 0;
  await page.route('https://lrclib.net/api/**', (r) => {
    requests++;
    expect(r.request().postData()).toBeNull();
    return r.fulfill({
      json: {
        id: 50,
        trackName: 'Signal',
        artistName: 'Wave Tests',
        albumName: 'First light',
        duration: 90,
        syncedLyrics: '[00:00]A local preview\n[00:06]An offline verse',
      },
    });
  });
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 90) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  expect(requests).toBe(0);
  const editor = await edit(page);
  await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('My unsaved draft');
  await editor.getByRole('button', { name: 'Search online' }).click();
  await expect(editor.getByRole('button', { name: 'Use found lyrics' })).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue(
    'My unsaved draft',
  );
  await expect(page.getByRole('contentinfo', { name: 'Music player' })).not.toBeVisible();
  await editor.getByRole('button', { name: 'Use found lyrics' }).click();
  await editor.getByRole('button', { name: 'Save lyrics' }).click();
  await expect(editor).toHaveCount(0);
  expect(requests).toBe(1);
  await page.reload();
  await edit(page);
  await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue(
    '[00:00]A local preview\n[00:06]An offline verse',
  );
  expect(requests).toBe(1);
});
test('failed editor searches keep the draft, expose cooldown and allow manual saving', async ({
  page,
}) => {
  let requests = 0;
  await page.route('https://lrclib.net/api/**', (r) => {
    requests++;
    return r.fulfill({ status: 503, headers: { 'Retry-After': '60' }, body: 'Busy' });
  });
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 90) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  const editor = await edit(page);
  await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('Manual text');
  await editor.getByRole('button', { name: 'Search online' }).click();
  await expect(editor.getByRole('status')).toContainText('draft is unchanged');
  await expect(editor.getByRole('button', { name: 'Search online' })).toBeDisabled();
  await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue(
    'Manual text',
  );
  await editor.getByRole('button', { name: 'Save lyrics' }).click();
  await edit(page);
  await expect(editor.getByRole('button', { name: 'Search online' })).toBeDisabled();
  expect(requests).toBe(1);
});
test('Home shows three local genre mixes after collection, with coherent native queue and no duplicated session', async ({
  page,
}) => {
  let remote = 0;
  await page.route(/^https:\/\//, (r) => {
    remote++;
    return r.abort();
  });
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles(
    ['Rock', 'Jazz', 'Electronic'].flatMap((genre, g) =>
      Array.from({ length: 3 }, (_, i) => ({
        name: `${genre}${i}.wav`,
        mimeType: 'audio/wav',
        buffer: wav(`${genre} ${i}`, 90, 8000, 16, `Artist ${g}`, `${genre} album`, genre),
      })),
    ),
  );
  await expect(page.getByRole('status')).toContainText('9 tracks added');
  await expect(page.locator('.daily-mix-card')).toHaveCount(3);
  await expect(page.locator('.home-content > section').nth(0)).toHaveAttribute(
    'aria-label',
    'Your collection',
  );
  await expect(page.locator('.home-content > section').nth(1)).toHaveAttribute(
    'aria-label',
    'Daily mixes',
  );
  const labels = await page.locator('.daily-mix-card').allTextContents();
  await page.reload();
  await expect(page.locator('.daily-mix-card')).toHaveCount(3);
  expect(await page.locator('.daily-mix-card').allTextContents()).toEqual(labels);
  await page.locator('.daily-mix-card').filter({ hasText: 'Rock' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current session' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show queue', exact: true }).click();
  await expect(page.locator('.queue-entry')).toHaveCount(3);
  for (const row of await page.locator('.queue-entry__info strong').allTextContents())
    expect(row).toMatch(/^Rock /);
  expect(remote).toBe(0);
});
test('larger text persists and narrow mobile forms, cards and playback remain inside their containers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 90) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Appearance');
  await page.getByRole('switch', { name: 'Larger text', exact: true }).click();
  await closeSettings(page);
  await expect(page.locator('.song-name strong').first()).toHaveCSS('font-size', '18px');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  const editor = await edit(page);
  await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveCSS(
    'font-size',
    '16px',
  );
  for (const control of await editor.locator('button,input,textarea').all()) {
    const b = await control.boundingBox();
    if (b) expect(b.x + b.width).toBeLessThanOrEqual(321);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('clicking dialog padding keeps an unsaved lyric draft; the real backdrop still dismisses', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles({
    name: 'Signal.wav',
    mimeType: 'audio/wav',
    buffer: wav('Signal', 90),
  });
  await expect(page.getByRole('status')).toContainText('1 track added');
  const editor = await edit(page);
  await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('Keep my unsaved verse');
  const bounds = (await editor.boundingBox())!;
  await page.mouse.click(bounds.x + 5, bounds.y + 5);
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue(
    'Keep my unsaved verse',
  );
  await page.mouse.move(bounds.x + 5, bounds.y + 5);
  await page.mouse.down();
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await expect(editor).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(editor).toHaveCount(0);
});

test('lyric editor keeps Close, Cancel, Remove and Save reachable at 320px with larger text and a short viewport', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('wave-large-text', 'true'));
  await page.setViewportSize({ width: 320, height: 360 });
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles({
    name: 'Signal.wav',
    mimeType: 'audio/wav',
    buffer: wav('Signal', 90),
  });
  await expect(page.getByRole('status')).toContainText('1 track added');
  const editor = await edit(page);
  await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('Saved original verse');
  await editor.getByRole('button', { name: 'Save lyrics' }).click();
  await expect(editor).toHaveCount(0);
  await edit(page);
  await editor
    .getByRole('textbox', { name: 'Lyrics', exact: true })
    .fill('A long unsaved line\n'.repeat(500));
  const body = editor.locator('.lyrics-editor-body');
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  for (const position of [0, 100000]) {
    await body.evaluate((el, top) => {
      el.scrollTop = top;
    }, position);
    for (const name of ['Close dialog', 'Cancel', 'Remove lyrics', 'Save lyrics']) {
      await expect(editor.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
  }
  await expect(editor.getByRole('heading', { name: 'Edit lyrics' })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await edit(page);
  await expect(editor.getByRole('textbox', { name: 'Lyrics', exact: true })).toHaveValue(
    'Saved original verse',
  );
});

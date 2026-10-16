import { settingsMenu, closeSettings } from './helpers/settings';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('wave-mix-v2') === null) localStorage.setItem('wave-mix-v2', 'false');
    if (localStorage.getItem('wave-autoplay') === null)
      localStorage.setItem('wave-autoplay', 'false');
  });
});

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

// Contract tests are deterministic and never depend on public-service availability.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('wave-lyrics-consent-v1') === null)
      localStorage.setItem('wave-lyrics-consent-v1', 'true');
    if (localStorage.getItem('wave-auto-lyrics') === null)
      localStorage.setItem('wave-auto-lyrics', 'true');
  });
  await page.route('https://lrclib.net/api/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  );
});

function wav(
  title: string,
  duration = 4,
  sampleRate = 8000,
  bitsPerSample = 16,
  artist = 'Wave Tests',
  album = 'First light',
) {
  const bytesPerSample = bitsPerSample / 8;
  const data = Buffer.alloc(sampleRate * duration * bytesPerSample);
  for (let i = 0; i < data.length / bytesPerSample; i++)
    data.writeIntLE(
      Math.round(
        Math.sin((i / sampleRate) * 440 * Math.PI * 2) * (bitsPerSample === 24 ? 128000 : 1000),
      ),
      i * bytesPerSample,
      bytesPerSample,
    );
  const chunk = (id: string, bytes: Buffer) => {
    const result = Buffer.alloc(8 + bytes.length + (bytes.length % 2));
    result.write(id, 0);
    result.writeUInt32LE(bytes.length, 4);
    bytes.copy(result, 8);
    return result;
  };
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(1, 2);
  format.writeUInt32LE(sampleRate, 4);
  format.writeUInt32LE(sampleRate * bytesPerSample, 8);
  format.writeUInt16LE(bytesPerSample, 12);
  format.writeUInt16LE(bitsPerSample, 14);
  const info = Buffer.concat([
    Buffer.from('INFO'),
    chunk('INAM', Buffer.from(`${title}\0`)),
    chunk('IART', Buffer.from(`${artist}\0`)),
    chunk('IPRD', Buffer.from(`${album}\0`)),
  ]);
  const body = Buffer.concat([
    Buffer.from('WAVE'),
    chunk('fmt ', format),
    chunk('LIST', info),
    chunk('data', data),
  ]);
  const header = Buffer.alloc(8);
  header.write('RIFF');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

async function createFixture(path: string, title: string, duration = 4) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, wav(title, duration));
  return path;
}

test('imports tagged audio, persists favorites, avoids duplicate identity, and plays', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  const path = await createFixture(info.outputPath('Signal.wav'), 'Signal', 12);
  await page.getByLabel('Import audio files').setInputFiles(path);
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.getByLabel('Import audio files').setInputFiles(path);
  await expect(page.getByRole('status')).toContainText('1 already in your library');
  await page.getByRole('button', { name: 'Favorite Signal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfavorite Signal', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Unfavorite Signal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play Signal by Wave Tests' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Seek' })).toBeEnabled();
  await expect.poll(() => page.getByRole('slider', { name: 'Seek' }).inputValue()).not.toBe('0');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show queue' }).click();
  await expect(page.getByRole('complementary', { name: 'Playback queue' })).toContainText('Signal');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('advances at track end and supports repeat-one and repeat-all', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  const a = await createFixture(info.outputPath('A.wav'), 'A', 1);
  const b = await createFixture(info.outputPath('B.wav'), 'B', 1);
  await page.getByLabel('Import audio files').setInputFiles([a, b]);
  // Queue assertions require the whole import, not just the first rendered row.
  await expect(page.getByRole('status')).toContainText('2 tracks added');
  await expect(page.getByRole('button', { name: 'Play A by Wave Tests' })).toBeVisible();
  await page.getByLabel('Sort tracks').selectOption('title');
  await page.getByRole('button', { name: 'Play A by Wave Tests' }).click();
  const footer = page.getByRole('contentinfo', { name: 'Music player' });
  await expect(footer).toContainText('B', { timeout: 5000 });
  await expect(footer.getByRole('button', { name: 'Play', exact: true })).toBeVisible({
    timeout: 5000,
  });
  await footer.getByRole('button', { name: 'Repeat: off' }).click();
  await footer.getByRole('button', { name: 'Repeat: all' }).click();
  await page.getByRole('button', { name: 'Play A by Wave Tests' }).click();
  await page.waitForTimeout(2300);
  await expect(footer).toContainText('A');
  await expect(footer.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await footer.getByRole('button', { name: 'Next track' }).click();
  await expect(footer).toContainText('B');
  await footer.getByRole('button', { name: 'Repeat: one' }).click();
  await footer.getByRole('button', { name: 'Repeat: off' }).click();
  await expect(footer).toContainText('A', { timeout: 5000 });
});

test('search, grouped browsing, deletion confirmation, and theme persistence', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  const path = await createFixture(info.outputPath('Signal.wav'), 'Signal');
  await page.getByLabel('Import audio files').setInputFiles(path);
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await page.getByLabel('Search library').fill('missing');
  await expect(page.getByText('No tracks found.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Albums', exact: true }).click();
  await page.getByRole('button', { name: 'First light Wave Tests' }).click();
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Appearance');
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Options for Signal', exact: true }).click();
  await page.getByRole('button', { name: 'Remove from library', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Remove this track?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep track' }).click();
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
  await page.getByRole('button', { name: 'Options for Signal', exact: true }).click();
  await page.getByRole('button', { name: 'Remove from library', exact: true }).click();
  await page.getByRole('button', { name: 'Remove track', exact: true }).click();
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
});

test('mobile layout stays inside the viewport and dialogs restore focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('region', { name: 'Settings' })).toBeVisible();
  await closeSettings(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open settings' })).toBeFocused();
});

test('reports malformed audio without claiming successful playback', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  const path = info.outputPath('Broken.mp3');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, 'not an audio file');
  await page.getByLabel('Import audio files').setInputFiles(path);
  await page.getByRole('button', { name: 'Play Broken by Unknown artist' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
});

test('accepts dropped audio and exposes working queue, shuffle, and volume controls', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.addInitScript(() => localStorage.setItem('wave-auto-lyrics', 'false'));
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.evaluate(
    (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], 'Signal.wav', { type: 'audio/wav' }));
      document
        .querySelector('.app-shell')!
        .dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    },
    [...wav('Signal', 12)],
  );
  await page.getByRole('button', { name: 'Play Signal by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Shuffle', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Volume' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Unmute', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Volume' })).toHaveValue('1');
  await page.getByRole('button', { name: 'Show queue' }).click();
  await page.getByRole('button', { name: 'Remove Signal from queue' }).click();
  await expect(page.getByText('Queue is empty')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('contentinfo', { name: 'Music player' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
  expect(
    requests.filter((url) => !url.startsWith('http://localhost:5173/') && !url.startsWith('blob:')),
  ).toEqual([]);
});

test('repeat-all restarts a single track without losing play intent', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  const path = await createFixture(info.outputPath('Solo.wav'), 'Solo', 1);
  await page.getByLabel('Import audio files').setInputFiles(path);
  await page.getByRole('button', { name: 'Play Solo by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Repeat: off' }).click();
  await page.waitForTimeout(2400);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('mobile bottom navigation and full player preserve playback and focus', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await expect(page.getByLabel('Search library')).toBeHidden();
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
  await expect(page.getByLabel('Search library')).toBeFocused();
  await navigation.getByRole('button', { name: 'Library', exact: true }).click();
  const path = await createFixture(info.outputPath('Signal.wav'), 'Signal', 20);
  await page.getByLabel('Import audio files').setInputFiles(path);
  await page.getByRole('button', { name: 'Play Signal by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const player = page.getByRole('dialog', { name: 'Now playing', exact: true });
  await expect(player.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(player.getByRole('slider', { name: 'Seek' })).toBeEnabled();
  await player.getByRole('button', { name: 'Show queue' }).click();
  const queue = page.getByRole('dialog', { name: 'Queue', exact: true });
  await expect(queue).toContainText('Signal');
  await queue.getByRole('button', { name: 'Close dialog' }).click();
  await expect(player.getByRole('button', { name: 'Show queue' })).toBeFocused();
  await player.getByRole('button', { name: 'Favorite current track' }).click();
  await expect(player.getByRole('button', { name: 'Unfavorite current track' })).toBeVisible();
  await player.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('button', { name: 'Open now playing' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('home uses real albums and keyboard search works from focused controls', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  const path = await createFixture(info.outputPath('Signal.wav'), 'Signal');
  await page.getByLabel('Import audio files').setInputFiles(path);
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Recently added albums' })).toBeVisible();
  await page.getByRole('button', { name: 'First light Wave Tests' }).click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Albums', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Play all songs' }).focus();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
  await expect(page.getByLabel('Search library')).toBeFocused();
});

test('Material layouts do not overflow at mobile, tablet, and desktop widths', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const box = await page.getByRole('navigation').boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  }
});

test('player colors follow local artwork and reset for an untagged cover', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  const path = await createFixture(info.outputPath('Signal.wav'), 'Signal', 20);
  await page.getByLabel('Import audio files').setInputFiles(path);
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
  // Generate an owned raster fixture and persist it as if it were embedded cover art.
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ba427c';
    context.fillRect(0, 0, 64, 64);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wave-library');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('tracks', 'readwrite');
    const store = transaction.objectStore('tracks');
    const request = store.getAll();
    request.onsuccess = () =>
      store.put({ ...request.result[0], artwork: canvas.toDataURL('image/png') });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Play Signal by Wave Tests' }).click();
  const player = page.getByRole('contentinfo', { name: 'Music player' });
  await expect
    .poll(() => player.evaluate((element) => element.style.getPropertyValue('--art-hue')))
    .toMatch(/^3\d{2}$/);
  const other = await createFixture(info.outputPath('Other.wav'), 'Other', 20);
  await page.getByLabel('Import audio files').setInputFiles(other);
  await page.getByRole('button', { name: 'Play Other by Wave Tests' }).click();
  await expect
    .poll(() => player.evaluate((element) => element.style.getPropertyValue('--art-hue')))
    .toBe('');
});

test('mobile song options support favorites and confirmed removal of the playing track', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  const path = await createFixture(info.outputPath('Signal.wav'), 'Signal', 20);
  await page.getByLabel('Import audio files').setInputFiles(path);
  await page.getByRole('button', { name: 'Play Signal by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Options for Signal' }).click();
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Song options' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Options for Signal' }).click();
  await expect(
    page.getByRole('button', { name: 'Remove from favorites', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove from library', exact: true }).click();
  await page.getByRole('button', { name: 'Keep track', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Options for Signal' }).click();
  await page.getByRole('button', { name: 'Remove from library', exact: true }).click();
  await page.getByRole('button', { name: 'Remove track', exact: true }).click();
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await expect(page.getByRole('contentinfo', { name: 'Music player' })).not.toBeVisible();
});

async function enableEditor(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Library management');
  await page.getByRole('switch', { name: 'Library editing' }).click();
  await closeSettings(page);
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toHaveCount(0);
}

async function coverImage(page: import('@playwright/test').Page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#8652a7';
    context.fillRect(0, 0, 96, 96);
    context.fillStyle = '#e6c6a3';
    context.beginPath();
    context.arc(48, 48, 25, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL('image/png');
  });
  return {
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
  };
}

test('creates persistent ordered playlists and deletes them without deleting music', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles([
      await createFixture(info.outputPath('A.wav'), 'A', 20),
      await createFixture(info.outputPath('B.wav'), 'B', 20),
    ]);
  await expect(page.getByRole('button', { name: 'Play A by Wave Tests' })).toBeVisible();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Create playlist', exact: true });
  await expect(form.getByLabel('Artwork file')).toHaveCount(0);
  await form.getByLabel('Playlist name').fill('Night drive');
  await form.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Night drive', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add songs', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Add songs', exact: true });
  await picker.getByRole('checkbox', { name: 'A Wave Tests', exact: true }).check();
  await picker.getByRole('checkbox', { name: 'B Wave Tests', exact: true }).check();
  await picker.getByRole('button', { name: 'Add 2 songs', exact: true }).click();
  await expect(page.locator('.song-row .track-info strong')).toHaveText(['A', 'B']);
  await page.getByRole('button', { name: 'Options for B', exact: true }).click();
  await page.getByRole('button', { name: 'Move up in playlist', exact: true }).click();
  await expect(page.locator('.song-row .track-info strong')).toHaveText(['B', 'A']);
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Night drive 2 songs', exact: true }).click();
  await expect(page.locator('.song-row .track-info strong')).toHaveText(['B', 'A']);
  await page.getByRole('button', { name: 'Options for B', exact: true }).click();
  await page.getByRole('button', { name: 'Remove from playlist', exact: true }).click();
  await expect(page.locator('.song-row .track-info strong')).toHaveText(['A']);
  await page.getByRole('button', { name: 'Delete playlist', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete playlist?' })
    .getByRole('button', { name: 'Delete playlist', exact: true })
    .click();
  await expect(page.getByText('Your first playlist starts here')).toBeVisible();
  await page.getByRole('button', { name: 'Songs', exact: true }).click();
  await expect(page.locator('.song-row')).toHaveCount(2);
});

test('adds a song through its options and creates a playlist directly', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Signal.wav'), 'Signal'));
  await page.getByRole('button', { name: 'Options for Signal', exact: true }).click();
  await page.getByRole('button', { name: 'Add to playlist', exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Create playlist', exact: true });
  await form.getByLabel('Playlist name').fill('Saved songs');
  await form.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved songs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
});

test('gates metadata editing, persists a custom cover, and restores original information', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Signal.wav'), 'Signal', 20));
  await page.getByRole('button', { name: 'Options for Signal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit song', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await enableEditor(page);
  await page.getByRole('button', { name: 'Play Signal by Wave Tests' }).click();
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(2);
  const timeBefore = Number(await seek.inputValue());
  await page.getByRole('button', { name: 'Favorite Signal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfavorite Signal', exact: true })).toBeVisible();
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThanOrEqual(timeBefore);
  await page.getByRole('button', { name: 'Options for Signal', exact: true }).click();
  await page.getByRole('button', { name: 'Edit song', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Edit song', exact: true });
  await form.getByLabel('Title', { exact: true }).fill('Manual title');
  await form.getByLabel('Artist', { exact: true }).fill('Local artist');
  await form.getByLabel('Album', { exact: true }).fill('Custom album');
  await form.getByLabel('Artwork file').setInputFiles(await coverImage(page));
  await expect(form.locator('.artwork-picker img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await form.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Play Manual title by Local artist' }),
  ).toBeVisible();
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThanOrEqual(timeBefore);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Play Manual title by Local artist' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Options for Manual title', exact: true }).click();
  await page.getByRole('button', { name: 'Edit song', exact: true }).click();
  await page
    .getByRole('button', { name: 'Restore original information and cover', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
  await expect(page.locator('.song-row .artwork img')).toHaveCount(0);
});

test('playlist covers and descriptions remain saved when library editing is turned off', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await enableEditor(page);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  let form = page.getByRole('dialog', { name: 'Create playlist', exact: true });
  await form.getByLabel('Playlist name').fill('Weekend');
  await form.getByLabel('Description', { exact: true }).fill('A few songs for Saturday.');
  await form.getByLabel('Artwork file').setInputFiles(await coverImage(page));
  await expect(form.locator('.artwork-picker img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await form.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Playlist details' }).getByText('A few songs for Saturday.'),
  ).toBeVisible();
  await expect(page.locator('.playlist-detail > .artwork img')).toBeVisible();
  await enableEditor(page); // Toggle the existing setting off.
  await page.getByRole('button', { name: 'Edit playlist', exact: true }).click();
  form = page.getByRole('dialog', { name: 'Edit playlist', exact: true });
  await expect(form.getByLabel('Artwork file')).toHaveCount(0);
  await expect(form.getByLabel('Description', { exact: true })).toHaveCount(0);
  await form.getByLabel('Playlist name').fill('Weekend renamed');
  await form.getByRole('button', { name: 'Save playlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Weekend renamed', exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Weekend renamed 0 songs', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Playlist details' }).getByText('A few songs for Saturday.'),
  ).toBeVisible();
  await expect(page.locator('.playlist-detail > .artwork img')).toBeVisible();
});

test('invalid artwork gives a recoverable error and does not replace the cover', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Signal.wav'), 'Signal'));
  await enableEditor(page);
  await page.getByRole('button', { name: 'Options for Signal', exact: true }).click();
  await page.getByRole('button', { name: 'Edit song', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Edit song', exact: true });
  await form.getByLabel('Artwork file').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(form.getByRole('alert')).toContainText('could not be read');
  await expect(form.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await expect(form.locator('.artwork-picker img')).toHaveCount(0);
});

test('animation preferences persist and system reduced motion suppresses decorative playback motion', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Signal.wav'), 'Signal', 20));
  await page.getByRole('button', { name: 'Play Signal by Wave Tests' }).click();
  await expect(page.locator('.equalizer i').first()).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Appearance');
  await page.getByRole('switch', { name: 'Animations', exact: true }).click();
  await closeSettings(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Appearance');
  await expect(page.getByRole('switch', { name: 'Animations', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );
});

test('playlist and editing surfaces fit narrow screens and preserve library deletion semantics', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Signal.wav'), 'Signal', 20));
  await enableEditor(page);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Create playlist', exact: true });
  await form
    .getByLabel('Playlist name')
    .fill('A deliberately long playlist name for narrow screens');
  await form.getByLabel('Description', { exact: true }).fill('Local collection, saved order.');
  await form.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await page.getByRole('button', { name: 'Add songs', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Signal Wave Tests', exact: true }).check();
  await page.getByRole('button', { name: 'Add 1 song', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Options for Signal', exact: true }).click();
    await page.getByRole('button', { name: 'Edit song', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit song', exact: true });
    await expect(editor.getByRole('button', { name: 'Save changes' })).toBeVisible();
    const bounds = await editor.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit song', exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Options for Signal', exact: true }).click();
  await page.getByRole('button', { name: 'Remove from library', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Remove this track?' })
    .getByRole('button', { name: 'Remove track', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toHaveCount(0);
  await expect(page.getByText('This playlist is empty')).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'A deliberately long playlist name for narrow screens 0 songs',
    }),
  ).toBeVisible();
});

test('mobile playlist cards scroll clear of the fixed player and bottom navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  for (const name of ['One', 'Two', 'Three']) {
    await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Create playlist', exact: true });
    await form.getByLabel('Playlist name').fill(name);
    await form.getByRole('button', { name: 'Create playlist', exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to playlists', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'One 0 songs', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.mouse.move(180, 500);
  await page.mouse.wheel(0, 400);
  await expect.poll(async () => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'One 0 songs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One', exact: true })).toBeVisible();
});

test('now playing fills every viewport and preserves original 24-bit audio', async ({ page }) => {
  const bytes = wav('Studio', 30, 44100, 24);
  const originalHash = createHash('sha256').update(bytes).digest('hex');
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Studio.wav', mimeType: 'audio/wav', buffer: bytes });
  await page.getByRole('button', { name: 'Play Studio by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const player = page.getByRole('dialog', { name: 'Now playing', exact: true });
  await expect(player.locator('.source-audio')).toHaveCount(0);
  const sourceMetadata = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('wave-library');
      req.onsuccess = () => resolve(req.result);
    });
    const tracks = await new Promise<unknown[]>((resolve) => {
      const req = db.transaction('tracks').objectStore('tracks').getAll();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return tracks;
  });
  expect(sourceMetadata).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        audioInfo: expect.objectContaining({ sampleRate: 44100, bitsPerSample: 24 }),
      }),
    ]),
  );
  await expect
    .poll(async () =>
      Number(await player.getByRole('slider', { name: 'Seek', exact: true }).inputValue()),
    )
    .toBeGreaterThan(0);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(player).toHaveCSS('transform', 'none');
    expect(await player.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
    const box = await player.boundingBox();
    expect(box!.x).toBe(0);
    expect(box!.y).toBe(0);
    expect(box!.width).toBe(width);
    expect(box!.height).toBe(900);
    expect(await player.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  const storedHash = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('wave-library');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const track = await new Promise<{ blob: Blob }>((resolve) => {
      const r = db.transaction('tracks').objectStore('tracks').getAll();
      r.onsuccess = () => resolve(r.result[0]);
    });
    db.close();
    return [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', await track.blob.arrayBuffer())),
    ]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  });
  expect(storedHash).toBe(originalHash);
  await page.setViewportSize({ width: 1440, height: 900 });
  await player.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('button', { name: 'Open now playing' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('artist details show only their albums and retain a working back action after deletion', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByLabel('Import audio files').setInputFiles([
    {
      name: 'First.wav',
      mimeType: 'audio/wav',
      buffer: wav('First', 20, 8000, 16, 'North', 'Shared'),
    },
    {
      name: 'Second.wav',
      mimeType: 'audio/wav',
      buffer: wav('Second', 20, 8000, 16, 'South', 'Shared'),
    },
  ]);
  await page.getByRole('button', { name: 'Artists', exact: true }).click();
  await page.getByRole('button', { name: /^North 1 song/ }).click();
  await expect(page.getByRole('region', { name: 'Artist details' })).toContainText('1 album');
  const albums = page.getByRole('region', { name: 'Artist albums' });
  await expect(albums.getByRole('button', { name: 'Shared North', exact: true })).toBeVisible();
  await expect(albums.getByRole('button', { name: 'Shared South', exact: true })).toHaveCount(0);
  for (const name of ['Play artist North', 'Shuffle artist North']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Show queue', exact: true }).click();
    const queue = page.getByRole('dialog', { name: 'Queue' });
    await expect(queue.locator('.queue-list strong')).toHaveText(['First']);
    await queue.getByRole('button', { name: 'Close dialog' }).click();
  }
  await albums.getByRole('button', { name: 'Shared North', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play First by North' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Second by South' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Artists', exact: true }).click();
  await page.getByRole('button', { name: /^North 1 song/ }).click();
  await page.getByRole('button', { name: 'Options for First' }).click();
  await page.getByRole('button', { name: 'Remove from library', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Remove this track?' })
    .getByRole('button', { name: 'Remove track', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Play First by North' })).toHaveCount(0);
  await expect(page.locator('#main')).toBeFocused();
  await page.getByRole('button', { name: 'Back to artists', exact: true }).click();
  await expect(page.getByRole('button', { name: /^South 1 song/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^North 1 song/ })).toHaveCount(0);
});

test('Home exposes real collection counts without duplicating the compact player', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Signal.wav'), 'Signal', 30));
  await page.getByRole('button', { name: 'Play Signal by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Create playlist', exact: true });
  await form.getByLabel('Playlist name').fill('Weekend');
  await form.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Weekend' })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Your collection' })
      .getByRole('button', { name: '1 Songs', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Your playlists' }).getByRole('button', { name: /Weekend/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Artists in your library' })
      .getByRole('button', { name: 'Wave Tests', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current session' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Now playing' })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Now playing' })
    .getByRole('button', { name: 'Close dialog' })
    .click();
  await expect(page.getByRole('button', { name: 'Open now playing', exact: true })).toBeFocused();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('contentinfo', { name: 'Music player' })).toBeVisible();
  }
  await page
    .getByRole('region', { name: 'Your playlists' })
    .getByRole('button', { name: /Weekend/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Weekend' })).toBeVisible();
});

test('volume persists, mute restores its previous level, and shuffled playlists restore their saved order', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles([
      await createFixture(info.outputPath('A.wav'), 'A', 30),
      await createFixture(info.outputPath('B.wav'), 'B', 30),
      await createFixture(info.outputPath('C.wav'), 'C', 30),
    ]);
  await expect(page.getByRole('status')).toContainText('3 tracks added');
  await page.getByRole('combobox', { name: 'Sort tracks' }).selectOption('title');
  await page.getByRole('button', { name: 'Play all songs' }).click();
  const volume = page.getByRole('slider', { name: 'Volume' });
  await volume.focus();
  await volume.press('Home');
  for (let index = 0; index < 37; index++) await volume.press('ArrowRight');
  await expect(volume).toHaveValue('0.37');
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(volume).toHaveValue('0');
  await page.getByRole('button', { name: 'Unmute', exact: true }).click();
  await expect(volume).toHaveValue('0.37');
  await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
  await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
  await page.getByRole('button', { name: 'Show queue', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Queue' }).locator('.queue-list strong'),
  ).toHaveText(['A', 'B', 'C']);
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Volume' })).toHaveValue('0.37');
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Volume' })).toHaveValue('0');
  await page.reload();
  await page.getByRole('button', { name: 'Unmute', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Volume' })).toHaveValue('0.37');
});

test('local LRC follows real playback, seeks to lines, survives reload and has a friendly empty state', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Lyrics.wav'), 'Lyrics', 30));
  await page.getByRole('button', { name: 'Play Lyrics by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  await expect(full.locator('.stage-lyrics')).toHaveAttribute('data-open', 'true');
  await expect(full.getByText('¡Oh, oh!')).toBeVisible();
  await expect(
    full.getByText('No hemos encontrado ninguna letra para esta canción.'),
  ).toBeVisible();
  await full.getByRole('button', { name: 'Add lyrics', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit lyrics' });
  await editor.getByLabel('Lyrics file').setInputFiles({
    name: 'lyrics.lrc',
    mimeType: 'text/plain',
    buffer: Buffer.from('[00:00.000]Opening\n[00:04.000]Second line\n[00:08.250]Third line'),
  });
  await expect(editor.getByText('3 synchronized lines')).toBeVisible();
  await editor.getByRole('button', { name: 'Save lyrics', exact: true }).click();
  await expect(editor).toHaveCount(0);
  if (!(await full.getByRole('button', { name: 'Seek to lyric: Third line' }).isVisible()))
    await full.getByRole('button', { name: 'Next lyric lines' }).click();
  await full.getByRole('button', { name: 'Seek to lyric: Third line' }).click();
  await expect(full.getByRole('button', { name: 'Seek to lyric: Third line' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  if (!(await full.getByRole('button', { name: 'Seek to lyric: Opening' }).isVisible()))
    await full.getByRole('button', { name: 'Previous lyric lines' }).click();
  await full.getByRole('button', { name: 'Seek to lyric: Opening' }).click();
  await expect(full.getByRole('button', { name: 'Seek to lyric: Opening' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(full.getByRole('button', { name: 'Seek to lyric: Second line' })).toHaveAttribute(
    'aria-current',
    'true',
    { timeout: 6000 },
  );
  await full.getByRole('button', { name: 'Pause', exact: true }).click();
  const active = await full.locator('.lyric-line[aria-current=true]').textContent();
  await page.waitForTimeout(300);
  expect(await full.locator('.lyric-line[aria-current=true]').textContent()).toBe(active);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await full.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await page.reload();
  await page.getByRole('button', { name: 'Play Lyrics by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(page.locator('.stage-lyrics')).toHaveAttribute('data-open', 'true');
  await expect(page.getByRole('button', { name: 'Seek to lyric: Third line' })).toBeVisible();
});

test('artist photos persist across profiles, gallery and Home and can be removed', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Portrait.wav'), 'Portrait', 30));
  await page.getByRole('button', { name: 'Artists', exact: true }).click();
  await page.getByRole('button', { name: /^Wave Tests 1 song/ }).click();
  await page.getByRole('button', { name: 'Edit artist photo', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit artist photo' });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#5aa7b2';
    ctx.fillRect(0, 0, 16, 16);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await editor.getByLabel('Artist photo file').setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(editor.getByRole('button', { name: 'Replace photo' })).toBeEnabled();
  await editor.getByRole('button', { name: 'Save artist photo' }).click();
  await expect(page.locator('.artist-detail .artist-photo')).toHaveCount(1);
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Artists', exact: true }).click();
  await expect(page.locator('.artist-card .artist-photo')).toHaveCount(1);
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.locator('.home-artist .artist-photo')).toHaveCount(1);
  await page
    .getByRole('region', { name: 'Artists in your library' })
    .getByRole('button', { name: 'Wave Tests', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit artist photo', exact: true }).click();
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await page.getByRole('button', { name: 'Save artist photo' }).click();
  await expect(page.locator('.artist-detail .artist-photo')).toHaveCount(0);
});

test('adds songs to an active or empty queue without interrupting or replacing it', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(
      await Promise.all(
        ['Alpha', 'Beta', 'Gamma'].map((title) =>
          createFixture(info.outputPath(title + '.wav'), title, 30),
        ),
      ),
    );
  await expect(page.getByRole('status')).toContainText('3 tracks added');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await page.getByRole('searchbox', { name: 'Search library' }).fill('Alpha');
  await page.getByRole('button', { name: 'Play Alpha by Wave Tests' }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Options for Beta' }).click();
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.getByRole('contentinfo', { name: 'Music player' })).toContainText('Alpha');
  await page.getByRole('button', { name: 'Show queue', exact: true }).click();
  const queue = page.getByRole('dialog', { name: 'Queue' });
  await expect(queue.locator('.queue-list strong')).toHaveText(['Alpha', 'Beta']);
  await queue.getByRole('button', { name: 'Add songs to queue', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Add songs to queue' });
  await picker.getByRole('checkbox', { name: 'Gamma Wave Tests', exact: true }).check();
  await picker.getByRole('button', { name: 'Add 1 song', exact: true }).click();
  await expect(queue.locator('.queue-list strong')).toHaveText(['Alpha', 'Beta', 'Gamma']);
  await page.reload();
  await page.getByRole('button', { name: 'Show queue', exact: true }).click();
  const restoredQueue = page.getByRole('dialog', { name: 'Queue' });
  await expect(restoredQueue.locator('.queue-list strong')).toHaveText(['Alpha', 'Beta', 'Gamma']);
  for (const title of ['Alpha', 'Beta', 'Gamma'])
    await restoredQueue
      .getByRole('button', { name: `Remove ${title} from queue`, exact: true })
      .click();
  await page.getByRole('button', { name: 'Add songs to queue', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Beta Wave Tests', exact: true }).check();
  await page.getByRole('button', { name: 'Add 1 song', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Queue' }).locator('.queue-list strong'),
  ).toHaveText(['Beta']);
  await page
    .getByRole('dialog', { name: 'Queue' })
    .getByRole('button', { name: 'Close dialog' })
    .click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('reorders complete playlists and albums with accessible controls and persists independent order', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(
      await Promise.all(
        ['A', 'B', 'C'].map((title) => createFixture(info.outputPath(title + '.wav'), title, 30)),
      ),
    );
  await expect(page.getByRole('status')).toContainText('3 tracks added');
  await page.getByRole('button', { name: 'Albums', exact: true }).click();
  await page.getByRole('button', { name: 'First light Wave Tests', exact: true }).click();
  await page.getByRole('button', { name: 'Reorder songs', exact: true }).click();
  let order = page.getByRole('dialog', { name: 'Reorder songs' });
  await order.getByRole('button', { name: 'Move C up', exact: true }).click();
  await order.getByRole('button', { name: 'Move C up', exact: true }).click();
  await order.getByRole('button', { name: 'Save order' }).click();
  await expect(page.locator('.song-title-button strong')).toHaveText(['C', 'A', 'B']);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  await page.getByRole('textbox', { name: 'Playlist name' }).fill('Roadtrip');
  await page
    .getByRole('dialog', { name: 'Create playlist', exact: true })
    .getByRole('button', { name: 'Create playlist', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add songs', exact: true }).click();
  for (const title of ['A', 'B', 'C'])
    await page.getByRole('checkbox', { name: title + ' Wave Tests', exact: true }).check();
  await page.getByRole('button', { name: 'Add 3 songs', exact: true }).click();
  await page.getByRole('button', { name: 'Reorder songs', exact: true }).click();
  order = page.getByRole('dialog', { name: 'Reorder songs' });
  await order.getByRole('button', { name: 'Move A down', exact: true }).click();
  await expect(order.getByRole('listitem', { name: 'A', exact: true })).toHaveCSS(
    'transform',
    'none',
  );
  const handle = order.getByRole('button', { name: 'Drag A to reorder' });
  const from = await handle.boundingBox(),
    to = await order.getByRole('listitem', { name: 'C', exact: true }).boundingBox();
  if (!from || !to) throw Error('Drag handles must be visible');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2 + 16, { steps: 15 });
  await page.mouse.up();
  await expect(order.locator('.reorder-row strong')).toHaveText(['B', 'C', 'A']);

  await order.getByRole('button', { name: 'Save order' }).click();
  await expect(page.locator('.song-title-button strong')).toHaveText(['B', 'C', 'A']);
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Albums', exact: true }).click();
  await page.getByRole('button', { name: 'First light Wave Tests', exact: true }).click();
  await expect(page.locator('.song-title-button strong')).toHaveText(['C', 'A', 'B']);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: /^Roadtrip 3 songs/ }).click();
  await expect(page.locator('.song-title-button strong')).toHaveText(['B', 'C', 'A']);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'Reorder songs', exact: true }).click();
    expect(
      await page
        .getByRole('dialog', { name: 'Reorder songs' })
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page
      .getByRole('dialog', { name: 'Reorder songs' })
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
  }
});

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'phone with collapsed lyrics', width: 390, height: 844 },
  { name: 'narrow phone with collapsed lyrics', width: 320, height: 568 },
]) {
  test(`Mix keeps full-size covers, overlaps native decoders and pauses both (${viewport.name})`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      const Native = window.Audio;
      const elements: HTMLAudioElement[] = [];
      Object.defineProperty(window, '__waveTestAudio', { value: elements });
      window.Audio = class extends Native {
        constructor(src?: string) {
          super(src);
          elements.push(this);
        }
      };
    });
    await page.goto('/');
    await expect(page.getByText('No songs yet')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Library', exact: true })
      .click();
    await page
      .getByLabel('Import audio files')
      .setInputFiles(
        await Promise.all(
          ['A', 'B', 'C'].map((title) => createFixture(info.outputPath(title + '.wav'), title, 8)),
        ),
      );
    await expect(page.getByRole('status')).toContainText('3 tracks added');
    await page.getByRole('button', { name: 'Open settings' }).click();
    await settingsMenu(page, 'Playback');
    const settings = page.getByRole('region', { name: 'Settings' });
    const mix = settings.getByRole('switch', { name: 'Mix', exact: true });
    await mix.click();
    await expect(mix).toHaveAttribute('aria-checked', 'true');
    await closeSettings(page);
    await page.getByRole('combobox', { name: 'Sort tracks' }).selectOption('title');
    await page.getByRole('button', { name: 'Play all songs' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const audios = (window as unknown as { __waveTestAudio: HTMLAudioElement[] })
            .__waveTestAudio;
          return audios.some((a) => !a.paused && a.currentTime > 0.1);
        }),
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Open now playing' }).click();
    if (viewport.width <= 700) {
      await page
        .getByRole('dialog', { name: 'Now playing' })
        .getByRole('button', { name: 'Lyrics', exact: true })
        .click();
      await expect(page.locator('.stage-lyrics')).toHaveAttribute('data-open', 'false');
    }
    await page.evaluate(() => {
      const playing = (
        window as unknown as { __waveTestAudio: HTMLAudioElement[] }
      ).__waveTestAudio.find((a) => !a.paused)!;
      playing.currentTime = 6.05;
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const playing = (
            window as unknown as { __waveTestAudio: HTMLAudioElement[] }
          ).__waveTestAudio.filter((a) => !a.paused);
          return playing.length === 2 && playing.every((a) => a.volume > 0 && a.volume < 1);
        }),
      )
      .toBe(true);
    const full = page.getByRole('dialog', { name: 'Now playing' });
    await expect(full.locator('.stage-track h3')).toHaveText('B');
    await expect(full.getByRole('progressbar', { name: 'Crossfade progress' })).toHaveCount(0);
    await expect(full.locator('.crossfade-status,.compact-crossfade')).toHaveCount(0);
    await expect
      .poll(async () => {
        const opacity = Number(
          await full.locator('.mix-incoming').evaluate((el) => getComputedStyle(el).opacity),
        );
        return opacity > 0 && opacity < 1;
      })
      .toBe(true);
    await expect(full.locator('.mix-artwork')).toBeVisible();
    const coverSizes = await full.locator('.mix-artwork').evaluate((element) => {
      const frame = element.getBoundingClientRect();
      const cover = element.closest('.stage-cover')!.getBoundingClientRect();
      return [...element.querySelectorAll('.artwork')].map((artwork) => {
        const box = artwork.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          frameWidth: frame.width,
          frameHeight: frame.height,
          coverWidth: cover.width,
          coverHeight: cover.height,
        };
      });
    });
    expect(coverSizes).toHaveLength(2);
    for (const size of coverSizes) {
      expect(size.width).toBeCloseTo(size.frameWidth, 0);
      expect(size.height).toBeCloseTo(size.frameHeight, 0);
      expect(size.frameWidth).toBeCloseTo(size.coverWidth, 0);
      expect(size.frameHeight).toBeCloseTo(size.coverHeight, 0);
    }
    const gains = await page.evaluate(() =>
      (window as unknown as { __waveTestAudio: HTMLAudioElement[] }).__waveTestAudio
        .filter((a) => !a.paused)
        .reduce((sum, a) => sum + a.volume * a.volume, 0),
    );
    expect(gains).toBeCloseTo(1, 3);
    await full.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(full.getByRole('progressbar', { name: 'Crossfade progress' })).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { __waveTestAudio: HTMLAudioElement[] }).__waveTestAudio.every(
            (a) => a.paused,
          ),
        ),
      )
      .toBe(true);
    await page.reload();
    await page.getByRole('button', { name: 'Open settings' }).click();
    await settingsMenu(page, 'Playback');
    await expect(page.getByRole('switch', { name: 'Mix', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
}

test('downloads matching lyrics without playing and retains compact synchronized lyrics offline after reload', async ({
  page,
}, info) => {
  let requests = 0;
  await page.route('https://lrclib.net/api/**', async (route) => {
    requests++;
    expect(route.request().postData()).toBeNull();
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('track_name')).toBe('Online');
    expect(query.get('artist_name')).toBe('Wave Tests');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 42,
        trackName: 'Online',
        artistName: 'Wave Tests',
        duration: 30,
        instrumental: false,
        syncedLyrics: '[00:00]Opening\n[00:04]Saved from LRCLIB\n[00:08]Last line',
        plainLyrics: 'Opening\nSaved from LRCLIB\nLast line',
      }),
    });
  });
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Online.wav'), 'Online', 30));
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const r = indexedDB.open('wave-library');
          r.onsuccess = () => resolve(r.result);
        });
        const saved = await new Promise<
          { lyrics?: { lines: unknown[] }; lyricsLookup?: { status: string } }[]
        >((resolve) => {
          const r = db.transaction('tracks').objectStore('tracks').getAll();
          r.onsuccess = () => resolve(r.result);
        });
        db.close();
        return saved[0]?.lyricsLookup?.status === 'found' && saved[0].lyrics?.lines.length === 0;
      }),
    )
    .toBe(true);
  await expect(page.getByRole('contentinfo', { name: 'Music player' })).not.toBeVisible();
  expect(requests).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Play Online by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  await expect(full.locator('.stage-lyrics')).toHaveAttribute('data-open', 'true');
  await expect(full.getByRole('link', { name: 'LRCLIB' })).toBeVisible();
  await full.getByRole('button', { name: 'Seek to lyric: Saved from LRCLIB' }).click();
  await expect(
    full.getByRole('button', { name: 'Seek to lyric: Saved from LRCLIB' }),
  ).toHaveAttribute('aria-current', 'true');
  await full.getByLabel('Adjust lyric timing').click();
  await full.getByRole('button', { name: 'Show lyrics 100 milliseconds later' }).click();
  await expect(full.getByText('+100 ms', { exact: true })).toBeVisible();
  expect(requests).toBe(1);
});

test('saves original bytes immediately, skips renamed duplicates and exposes storage protection', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let protectedStorage = false;
    Object.defineProperty(navigator.storage, 'persist', {
      value: async () => {
        protectedStorage = true;
        return true;
      },
    });
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => protectedStorage });
  });
  const bytes = wav('Kept', 8),
    hash = createHash('sha256').update(bytes).digest('hex');
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'original.wav', mimeType: 'audio/wav', buffer: bytes });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await expect(page.getByRole('contentinfo', { name: 'Music player' })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play Kept by Wave Tests' })).toBeVisible();
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'renamed.wav', mimeType: 'audio/wav', buffer: bytes });
  await expect(page.getByRole('status')).toContainText('1 already in your library');
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('wave-library');
      r.onsuccess = () => resolve(r.result);
    });
    const tracks = await new Promise<{ blob: Blob; contentHash: string }[]>((resolve) => {
      const r = db.transaction('tracks').objectStore('tracks').getAll();
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    const digest = await crypto.subtle.digest('SHA-256', await tracks[0].blob.arrayBuffer());
    return {
      count: tracks.length,
      hash: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''),
      contentHash: tracks[0].contentHash,
    };
  });
  expect(saved).toEqual({ count: 1, hash, contentHash: hash });
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Storage');
  const settings = page.getByRole('region', { name: 'Settings' });
  await expect(settings.getByText('Original audio', { exact: true })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Storage protected' })).toBeVisible();
});

test('automatic lyrics respects persisted opt-out and manual lyrics win over lookup', async ({
  page,
}, info) => {
  let requests = 0;
  await page.route('https://lrclib.net/api/**', async (route) => {
    requests++;
    await route.fulfill({ status: 404, body: '{}' });
  });
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Lyrics');
  const settings = page.getByRole('region', { name: 'Settings' });
  await settings.getByRole('switch', { name: 'Automatic lyrics' }).click();
  await expect(settings.getByRole('switch', { name: 'Automatic lyrics' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await closeSettings(page);
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Manual.wav'), 'Manual', 30));
  await page.getByRole('button', { name: 'Play Manual by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  await expect(full.locator('.stage-lyrics')).toHaveAttribute('data-open', 'true');
  await full.getByRole('button', { name: 'Add lyrics', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit lyrics' });
  await editor.getByRole('textbox', { name: 'Lyrics', exact: true }).fill('[00:00]My own lyrics');
  await editor.getByRole('button', { name: 'Save lyrics', exact: true }).click();
  await expect(full.getByRole('button', { name: 'Seek to lyric: My own lyrics' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Lyrics');
  await expect(settings.getByRole('switch', { name: 'Automatic lyrics' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await settings.getByRole('switch', { name: 'Automatic lyrics' }).click();
  await closeSettings(page);
  await page.getByRole('button', { name: 'Play Manual by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(full.locator('.stage-lyrics')).toHaveAttribute('data-open', 'true');
  await expect(full.getByRole('button', { name: 'Seek to lyric: My own lyrics' })).toBeVisible();
  expect(requests).toBe(0);
});

test('reports lookup errors honestly, caches them and retries explicitly', async ({
  page,
}, info) => {
  let requests = 0;
  await page.route('https://lrclib.net/api/**', async (route) => {
    requests++;
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Retry.wav'), 'Retry', 30));
  await page.getByRole('button', { name: 'Play Retry by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  let full = page.getByRole('dialog', { name: 'Now playing' });
  await expect(full.locator('.stage-lyrics')).toHaveAttribute('data-open', 'true');
  await expect(full.getByText('No hemos podido conectar con el servicio de letras.')).toBeVisible();
  expect(requests).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Play Retry by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  full = page.getByRole('dialog', { name: 'Now playing' });
  await expect(full.locator('.stage-lyrics')).toHaveAttribute('data-open', 'true');
  await expect(full.getByText('No hemos podido conectar con el servicio de letras.')).toBeVisible();
  expect(requests).toBe(1);
  await full.getByRole('button', { name: 'Search again' }).click();
  await expect.poll(() => requests).toBe(2);
  await expect(full.getByRole('button', { name: 'Search again' })).toBeEnabled();
});

test('collapsed player stays compact, sidebar shortcuts navigate and Home preserves collection access', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Compact.wav'), 'Compact', 30));
  await page.getByRole('button', { name: 'Play Compact by Wave Tests' }).click();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const bar = page.getByRole('contentinfo', { name: 'Music player' });
    await expect(bar).toHaveCSS('height', '64px');
    await expect(page.getByRole('dialog', { name: 'Now playing' })).toHaveCount(0);
    await expect(bar.getByRole('button', { name: 'Open now playing' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Browse albums' }).click();
  await expect(page.getByRole('button', { name: 'Albums', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Browse favorite songs' }).click();
  await expect(page.getByText('No favorites yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Home', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Recently added albums' })).toBeVisible();
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Now playing' })).toHaveCSS('width', '1440px');
});

test('lyric text fills with native time, not bars, and resets on seek with reduced motion', async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem('wave-auto-lyrics', 'false'));
  await page.goto('/');
  await expect(page.getByText('No songs yet')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles(await createFixture(info.outputPath('Fill.wav'), 'Fill', 20));
  await page.getByRole('button', { name: 'Play Fill by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  await full.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(full.locator('.stage-lyrics')).toHaveAttribute('data-open', 'true');
  await full.getByRole('button', { name: 'Add lyrics', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit lyrics' });
  await editor
    .getByRole('textbox', { name: 'Lyrics', exact: true })
    .fill('[00:00]First word\n[00:04]Second line\n[00:08]Last line');
  await editor.getByRole('button', { name: 'Save lyrics', exact: true }).click();
  await page.locator('dialog[aria-label="Edit lyrics"]').waitFor({ state: 'detached' });
  const seek = full.getByRole('slider', { name: 'Seek' });
  await seek.focus();
  await seek.press('Home');
  for (let i = 1; i <= 20; i++) {
    await seek.press('ArrowRight');
    await expect(seek).toHaveValue(String(i / 10));
  }
  const first = full.getByRole('button', { name: 'Seek to lyric: First word' });
  await expect
    .poll(async () => Number(await first.locator('.lyric-text').getAttribute('data-fill')))
    .toBeCloseTo(0.5, 1);
  await expect(first.locator('.lyric-word').first()).toHaveCSS('background-clip', 'text');
  await expect(full.locator('.lyric-elapsed,[role=progressbar]')).toHaveCount(0);
  await full.getByRole('button', { name: 'Seek to lyric: Second line' }).click();
  await expect(first.locator('.lyric-text')).toHaveAttribute('data-fill', '1');
  await full.getByRole('button', { name: 'Seek to lyric: First word' }).click();
  await expect(first.locator('.lyric-text')).toHaveAttribute('data-fill', '0');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await full.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(async () => Number(await first.locator('.lyric-text').getAttribute('data-fill')))
    .toBeGreaterThan(0.05);
  await full.getByRole('button', { name: 'Pause', exact: true }).click();
  const fill = await first.locator('.lyric-text').getAttribute('data-fill');
  await page.waitForTimeout(150);
  expect(await first.locator('.lyric-text').getAttribute('data-fill')).toBe(fill);
});

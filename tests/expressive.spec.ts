import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('wave-mix-v2') === null) localStorage.setItem('wave-mix-v2', 'false');
    if (localStorage.getItem('wave-autoplay') === null)
      localStorage.setItem('wave-autoplay', 'false');
  });
});

import { wav } from './helpers/audio';
async function importSong(page: Page) {
  const buffer = wav('Dynamics', 120);
  const start = buffer.indexOf(Buffer.from('data')) + 8;
  for (let i = start; i < buffer.length; i += 2) {
    const seconds = (i - start) / 2 / 8000;
    buffer.writeInt16LE(seconds < 1.5 ? 0 : buffer.readInt16LE(i) * 6, i);
  }
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Dynamics.wav', mimeType: 'audio/wav', buffer });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('wave-library');
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction('tracks', 'readwrite'),
      store = tx.objectStore('tracks'),
      r = store.getAll();
    r.onsuccess = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const x = c.getContext('2d')!;
      x.fillStyle = '#ba427c';
      x.fillRect(0, 0, 32, 32);
      store.put({ ...r.result[0], artwork: c.toDataURL() });
    };
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    db.close();
  });
  await page.reload();
}
test.beforeEach(async ({ page }) => {
  await page.route('https://lrclib.net/api/**', (r) => r.fulfill({ status: 404, body: '{}' }));
});
test('startup morphs the Wave mark and settles without trapping the interface', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const boot = page.getByRole('progressbar', { name: 'Loading Wave' });
  await expect(boot).toBeVisible();
  const initial = await boot.locator('path').getAttribute('d');
  await expect.poll(() => boot.locator('path').getAttribute('d')).not.toBe(initial);
  await expect(boot).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await expect(page.getByPlaceholder('Filter this collection')).toHaveCount(0);
});
test('compact artist opens the whole player, full artwork toggles playback, and pausing resets the palette', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await importSong(page);
  await page.getByRole('button', { name: 'Play Dynamics by Wave Tests' }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--wave-hue')))
    .toMatch(/^3\d\d$/);
  const footer = page.getByRole('contentinfo', { name: 'Music player' });
  await expect(footer.getByRole('button', { name: 'Open artist Wave Tests' })).toHaveCount(0);
  await footer.locator('.compact-artist').click();
  const full = page.getByRole('dialog', { name: 'Now playing', exact: true });
  await expect(full).toBeVisible();
  await full.getByRole('button', { name: 'Pause from artwork' }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--wave-hue')))
    .toBe('226');
  await expect(full.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await full.getByRole('button', { name: 'Open artist Wave Tests' }).click();
  await expect(page.getByRole('heading', { name: 'Wave Tests', exact: true })).toBeVisible();
});
test('background energy follows source amplitude and stops on pause and reduced motion', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.Audio;
    const audios: HTMLAudioElement[] = [];
    Object.defineProperty(window, '__visualAudio', { value: audios });
    window.Audio = class extends Native {
      constructor(src?: string) {
        super(src);
        audios.push(this);
      }
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await importSong(page);
  await page.getByRole('button', { name: 'Play Dynamics by Wave Tests' }).click();
  const energy = () =>
    page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--music-energy')));
  await expect.poll(energy).toBeGreaterThan(0.2);
  await expect(page.locator('html')).toHaveAttribute('data-music-analysis', 'live');
  await page.evaluate(() => {
    const audio = (window as unknown as { __visualAudio: HTMLAudioElement[] }).__visualAudio.find(
      (a) => !a.paused,
    )!;
    audio.currentTime = 0.1;
    audio.dispatchEvent(new Event('timeupdate'));
  });
  await expect.poll(energy, { intervals: [40, 40, 40, 40] }).toBeLessThan(0.03);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(energy).toBe(0);
  await expect(page.locator('html')).toHaveAttribute('data-music-active', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(energy).toBe(0);
  await expect(page.locator('.music-backdrop')).toBeHidden();
});
test('a rejected exact lyric query falls back to structured search and stores the verified recording', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await importSong(page);
  await page.route('https://lrclib.net/api/**', (r) =>
    r.request().url().includes('/get?')
      ? r.fulfill({ status: 400, body: '{}' })
      : r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 123,
              trackName: 'Dynamics',
              artistName: 'Wave Tests',
              duration: 120,
              syncedLyrics: '[00:00]A verified line\n[00:04]Another line',
            },
          ]),
        }),
  );
  await page.getByRole('button', { name: 'Play Dynamics by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  await full.getByRole('button', { name: 'Search again' }).click();
  await expect(full.getByText('A verified line', { exact: true })).toBeVisible();
  await expect(full.getByRole('link', { name: 'LRCLIB' })).toBeVisible();
});
test('persisted provider cooldown is visible and cannot be bypassed with a reload', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await importSong(page);
  let requests = 0;
  await page.route('https://lrclib.net/api/**', (r) => {
    requests++;
    return r.fulfill({ status: 429, headers: { 'Retry-After': '60' }, body: '{}' });
  });
  await page.getByRole('button', { name: 'Play Dynamics by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  let full = page.getByRole('dialog', { name: 'Now playing' });
  await full.getByRole('button', { name: 'Search again' }).click();
  await expect(full.getByText(/El servicio ha pedido una pausa/)).toBeVisible();
  expect(requests).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  full = page.getByRole('dialog', { name: 'Now playing' });
  await expect(full.getByText(/El servicio ha pedido una pausa/)).toBeVisible();
  await expect(full.getByRole('button', { name: 'Search again' })).toBeDisabled();
  expect(requests).toBe(1);
});
test('press feedback stays within its control and is removed when reduced motion switches on', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.getByRole('progressbar', { name: 'Loading Wave' })).toHaveCount(0);
  const button = page.getByRole('button', { name: 'Import music', exact: true });
  const bounds = await button.boundingBox();
  await button.dispatchEvent('pointerdown', {
    clientX: bounds!.x + bounds!.width / 2,
    clientY: bounds!.y + bounds!.height / 2,
  });
  await expect(button.locator('.wave-ripple')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(button.locator('.wave-ripple')).toHaveCount(0);
  await expect(button).not.toHaveClass(/ripple-anchor/);
});

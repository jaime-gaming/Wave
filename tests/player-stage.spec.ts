import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('wave-mix-v2') === null) localStorage.setItem('wave-mix-v2', 'false');
    if (localStorage.getItem('wave-autoplay') === null)
      localStorage.setItem('wave-autoplay', 'false');
  });
});

import { wav } from './helpers/audio';
async function song(page: Page, lyrics = false) {
  await page.addInitScript(() => {
    const Native = window.Audio;
    const audio: HTMLAudioElement[] = [];
    Object.defineProperty(window, '__stageAudio', { value: audio });
    window.Audio = class extends Native {
      constructor(src?: string) {
        super(src);
        audio.push(this);
      }
    };
  });
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 120) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  if (lyrics) {
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open('wave-library');
        r.onsuccess = () => resolve(r.result);
      });
      const tx = db.transaction('tracks', 'readwrite'),
        store = tx.objectStore('tracks'),
        r = store.getAll();
      r.onsuccess = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const x = canvas.getContext('2d')!;
        x.fillStyle = '#a95679';
        x.fillRect(0, 0, 64, 64);
        store.put({
          ...r.result[0],
          artwork: canvas.toDataURL(),
          lyrics: {
            source: 'local',
            offsetMs: 0,
            raw: '[00:00]An opening line that stays sharp and complete\n[00:04]A second line to follow\n[00:08]A final line',
            lines: [],
          },
        });
      };
      await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
      db.close();
    });
    await page.reload();
  }
  await page.getByRole('button', { name: 'Play Signal by Wave Tests', exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByRole('contentinfo', { name: 'Music player' })
        .getByRole('slider', { name: 'Seek' })
        .inputValue(),
    )
    .not.toBe('0');
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Now playing', exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.route('https://lrclib.net/api/**', (r) => r.fulfill({ status: 404, body: '{}' }));
});
test('responsive wave spans the entire seek track, keeps its thumb inside and supports keyboard seeking', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await song(page, true);
  const full = page.getByRole('dialog', { name: 'Now playing', exact: true }),
    slider = full.getByRole('slider', { name: 'Seek' });
  await full.getByRole('button', { name: 'Pause', exact: true }).click();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [700, 360],
    [844, 390],
    [1440, 600],
    [2560, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    for (const seconds of [0, 0.1, 60, 119.9]) {
      await page.evaluate((seconds) => {
        const a = (window as unknown as { __stageAudio: HTMLAudioElement[] }).__stageAudio.find(
          (a) => !!a.src,
        )!;
        a.currentTime = seconds;
        a.dispatchEvent(new Event('timeupdate'));
      }, seconds);
      await expect.poll(() => slider.inputValue()).toBe(String(seconds));
      await expect
        .poll(() =>
          full.locator('.wave-seek').evaluate((el) => {
            const svg = el.querySelector('svg')!,
              thumb = el.querySelector<SVGGraphicsElement>('.wave-seek__thumb')!,
              wave = el.querySelector('.wave-seek__played')!;
            const width = svg.viewBox.baseVal.width,
              r = el.getBoundingClientRect(),
              t = thumb.getBoundingClientRect();
            const end = Number(wave.getAttribute('d')!.trim().split(' ').at(-2));
            return (
              Math.abs(width - r.width) < 1 &&
              t.left >= r.left &&
              t.right <= r.right &&
              end >= width + 32
            );
          }),
        )
        .toBe(true);
    }
  }
  await slider.focus();
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('0.1');
  await slider.press('End');
  await expect(slider).toHaveValue('120');
  await slider.press('ArrowLeft');
  await expect(slider).toHaveValue('119.9');
  await slider.press('Home');
  await full.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(full.locator('.wave-seek')).toHaveAttribute('data-playing', 'true');
  await expect(full.locator('.wave-seek__played')).toHaveCSS('animation-name', 'stage-wave-travel');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(full.locator('.wave-seek__played')).toHaveCSS('animation-name', 'none');
});
test('artwork remains square, controls and icons stay bounded, and lyric timing opens deliberately', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await song(page, true);
  const full = page.getByRole('dialog', { name: 'Now playing', exact: true });
  await full.getByRole('button', { name: 'Pause', exact: true }).click();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [700, 360],
    [844, 390],
    [768, 700],
    [1440, 600],
    [2560, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        full.evaluate((el) => {
          const cover = el.querySelector('.stage-cover')!.getBoundingClientRect();
          return (
            el.scrollHeight <= el.clientHeight &&
            el.scrollWidth <= el.clientWidth &&
            Math.abs(cover.width - cover.height) < 2
          );
        }),
      )
      .toBe(true);
    const escapes = await full.locator('button svg').evaluateAll((icons) =>
      icons
        .filter((icon) => {
          if (!icon.checkVisibility()) return false;
          const box = icon.getBoundingClientRect(),
            button = icon.closest('button')!.getBoundingClientRect();
          return (
            box.left < button.left - 1 ||
            box.right > button.right + 1 ||
            box.top < button.top - 1 ||
            box.bottom > button.bottom + 1
          );
        })
        .map((icon) => icon.closest('button')!.getAttribute('aria-label')),
    );
    expect(escapes, `${width}×${height}`).toEqual([]);
  }
  const captions = await full.locator('.sr-only').evaluateAll((nodes) =>
    nodes.map((el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    }),
  );
  expect(captions.length).toBeGreaterThan(0);
  expect(captions.every((r) => r.width <= 1 && r.height <= 1)).toBe(true);
  const later = full.getByRole('button', { name: 'Show lyrics 100 milliseconds later' });
  await expect(later).toBeHidden();
  await full.getByLabel('Adjust lyric timing').click();
  await expect(later).toBeVisible();
  await later.click();
  await expect(full.getByText('+100 ms', { exact: true })).toBeVisible();
  await full.getByLabel('Adjust lyric timing').click();
  await expect(later).toBeHidden();
  await expect(full.getByText(/Word-timed|saved offline/)).toHaveCount(0);
});
test('a blocked headered lyric request retries without preflight and keeps the result offline', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await song(page);
  const requests: { url: string; headers: Record<string, string> }[] = [];
  await page.route('https://lrclib.net/api/**', async (r) => {
    requests.push({ url: r.request().url(), headers: r.request().headers() });
    if (r.request().headers()['lrclib-client']) return r.abort('failed');
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 541,
        trackName: 'Signal',
        artistName: 'Wave Tests',
        albumName: 'First light',
        duration: 120,
        instrumental: false,
        syncedLyrics: '[00:00]A verified saved line\n[00:04]Another saved line',
        plainLyrics: 'A verified saved line\nAnother saved line',
      }),
    });
  });
  const full = page.getByRole('dialog', { name: 'Now playing', exact: true });
  await full.getByRole('button', { name: 'Search again' }).click();
  await expect(
    full.getByRole('button', { name: 'Seek to lyric: A verified saved line' }),
  ).toBeVisible();
  await expect(full.getByRole('link', { name: 'LRCLIB' })).toHaveAttribute(
    'href',
    'https://lrclib.net/lyrics/541',
  );
  expect(requests).toHaveLength(2);
  expect(requests[0].url).toBe(requests[1].url);
  expect(requests[0].headers).toHaveProperty('lrclib-client');
  expect(requests[1].headers).not.toHaveProperty('lrclib-client');
  await page.reload();
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Seek to lyric: A verified saved line' }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
});
test('a real native-audio signal visibly drives the modal without changing output or retaining capture on pause', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await song(page, true);
  const root = page.locator('html'),
    full = page.getByRole('dialog', { name: 'Now playing', exact: true });
  await expect(root).toHaveAttribute('data-music-analysis', 'live');
  await expect
    .poll(() => full.locator('.stage-aura').evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThan(0.1);
  const audio = () =>
    page.evaluate(() => {
      const a = (window as unknown as { __stageAudio: HTMLAudioElement[] }).__stageAudio.find(
        (a) => !a.paused,
      )!;
      return { time: a.currentTime, src: a.src, volume: a.volume };
    });
  const before = await audio();
  await expect.poll(async () => (await audio()).time).toBeGreaterThan(before.time + 0.2);
  expect((await audio()).src).toBe(before.src);
  expect((await audio()).volume).toBe(before.volume);
  await full.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(root).toHaveAttribute('data-music-active', 'false');
  await expect(root).not.toHaveAttribute('data-music-analysis', 'live');
  await expect(full.locator('.stage-aura')).toHaveCSS('opacity', '0');
});

test('unsupported stream capture uses the bounded source envelope and honors mute', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(HTMLAudioElement.prototype, 'captureStream', {
      value: undefined,
      configurable: true,
    }),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await song(page, true);
  const full = page.getByRole('dialog', { name: 'Now playing', exact: true });
  await expect(page.locator('html')).toHaveAttribute('data-music-analysis', 'envelope');
  await expect
    .poll(() => full.locator('.stage-aura').evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThan(0.1);
  await full.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-music-active', 'false');
  await expect(full.locator('.stage-aura')).toHaveCSS('opacity', '0');
  await full.getByRole('button', { name: 'Unmute', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-music-active', 'true');
});

import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('wave-mix-v2') === null) localStorage.setItem('wave-mix-v2', 'false');
    if (localStorage.getItem('wave-autoplay') === null)
      localStorage.setItem('wave-autoplay', 'false');
  });
});

import { wav } from './helpers/audio';
async function setup(page: Page, lyrics = false) {
  await page.addInitScript(() => {
    const Native = window.Audio;
    const elements: HTMLAudioElement[] = [];
    Object.defineProperty(window, '__refineAudio', { value: elements });
    window.Audio = class extends Native {
      constructor(src?: string) {
        super(src);
        elements.push(this);
      }
    };
  });
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles(
    ['Signal', 'Next'].map((title) => ({
      name: `${title}.wav`,
      mimeType: 'audio/wav',
      buffer: wav(title, 120),
    })),
  );
  await expect(page.getByRole('status')).toContainText('2 tracks added');
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
        const track = r.result.find((t) => t.title === 'Signal');
        store.put({
          ...track,
          lyrics: {
            source: 'local',
            offsetMs: 0,
            raw: '[00:00]An opening verse that remains sharp and complete as the listening stage changes size\n[00:12]A gentle second line\n[00:24]One final verse',
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
}
const native = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as { __refineAudio: HTMLAudioElement[] }).__refineAudio.find(
      (a) => !a.paused,
    )!;
    return { src: a.src, time: a.currentTime, volume: a.volume };
  });
test.beforeEach(async ({ page }) => {
  await page.route('https://lrclib.net/api/**', (r) => r.fulfill({ status: 404, body: '{}' }));
});
test('diffuse spectral lights distinguish actual bass/mid/high signals and move independently', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const Native = window.Audio;
    const elements: HTMLAudioElement[] = [];
    Object.defineProperty(window, '__refineAudio', { value: elements });
    window.Audio = class extends Native {
      constructor(src?: string) {
        super(src);
        elements.push(this);
      }
    };
  });
  await page.goto('/');
  const buffer = wav('Spectrum', 30, 24000),
    start = buffer.indexOf(Buffer.from('data')) + 8;
  for (let i = start; i < buffer.length; i += 2) {
    const t = (i - start) / 2 / 24000,
      hz = t < 4 ? 100 : t < 8 ? 1000 : 6000;
    buffer.writeInt16LE(Math.round(Math.sin(t * hz * 2 * Math.PI) * 12000), i);
  }
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Spectrum.wav', mimeType: 'audio/wav', buffer });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.getByRole('button', { name: 'Play Spectrum by Wave Tests', exact: true }).click();
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-music-analysis', 'live');
  for (const [seconds, band] of [
    [1, 'bass'],
    [5, 'body'],
    [9, 'air'],
  ] as const) {
    await page.evaluate((seconds) => {
      const a = (window as unknown as { __refineAudio: HTMLAudioElement[] }).__refineAudio.find(
        (a) => !a.paused,
      )!;
      a.currentTime = seconds;
      a.dispatchEvent(new Event('timeupdate'));
    }, seconds);
    await expect
      .poll(() =>
        page.evaluate((band) => {
          const s = document.documentElement.style,
            main = Number(s.getPropertyValue(`--music-${band}`));
          return (
            main > 0.5 &&
            ['bass', 'body', 'air']
              .filter((b) => b !== band)
              .every((b) => main > Number(s.getPropertyValue(`--music-${b}`)) + 0.15)
          );
        }, band),
      )
      .toBe(true);
  }
  const layer = page.locator('.stage-aura .music-lighting__air'),
    before = await layer.evaluate((el) => getComputedStyle(el).transform);
  await expect.poll(() => layer.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);
  await expect(page.locator('.stage-aura')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.stage-aura')).toHaveCSS('filter', 'none');
  await page
    .getByRole('dialog', { name: 'Now playing' })
    .getByRole('button', { name: 'Pause', exact: true })
    .click();
  await expect(page.locator('.stage-aura')).toHaveCSS('opacity', '0');
});
test('the small player exposes the same curved seek at every width without opening the stage', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await setup(page);
  const footer = page.getByRole('contentinfo', { name: 'Music player' });
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 700],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(footer.locator('.wave-seek')).toBeVisible();
    await expect(footer.locator('.wave-seek')).toHaveAttribute('data-playing', 'true');
    const safe = await footer.locator('.wave-seek').evaluate((el) => {
      const r = el.getBoundingClientRect(),
        p = el.closest('footer')!.getBoundingClientRect();
      return r.left >= p.left && r.right <= p.right && r.bottom <= p.bottom + 1;
    });
    expect(safe).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await footer.getByRole('button', { name: 'Pause', exact: true }).click();
  const seek = footer.getByRole('slider', { name: 'Seek' });
  await seek.focus();
  await seek.press('Home');
  await seek.press('ArrowRight');
  await expect(seek).toHaveValue('0.1');
  await expect(page.getByRole('dialog', { name: 'Now playing' })).toHaveCount(0);
  expect(await footer.evaluate((el) => el.clientHeight)).toBe(64);
});
test('Queue is a bounded tonal sheet and selecting/removing rows preserves playback intent', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await page.getByRole('button', { name: 'Show queue', exact: true }).click();
  const queue = page.getByRole('dialog', { name: 'Queue', exact: true });
  await expect(queue).toHaveClass(/queue-sheet/);
  await expect(queue.locator('.queue-list li')).toHaveCount(2);
  const before = await native(page);
  await queue.getByRole('button', { name: 'Play Signal from queue' }).click();
  const after = await native(page);
  expect(after.src).toBe(before.src);
  expect(after.time).toBeGreaterThanOrEqual(before.time);
  await queue.getByRole('button', { name: 'Remove Next from queue' }).click();
  await expect(queue.locator('.queue-list li')).toHaveCount(1);
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 568],
    [700, 360],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await queue.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.top >= 0 &&
          r.bottom <= innerHeight &&
          r.left >= 0 &&
          r.right <= innerWidth &&
          el.scrollHeight <= el.clientHeight
        );
      }),
    ).toBe(true);
  }
  await queue.getByRole('button', { name: 'Close dialog' }).click();
  await expect.poll(async () => (await native(page)).time).toBeGreaterThan(after.time);
});
test('album verification searches past an exact compilation and retains the correct deluxe recording', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  const record = {
    trackName: 'Signal',
    artistName: 'Wave Tests',
    duration: 120,
    instrumental: false,
    plainLyrics: 'Matched album verse',
    syncedLyrics: '[00:00]Matched album verse\n[00:12]Second verse',
  };
  await page.route('https://lrclib.net/api/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        r.request().url().includes('/search?')
          ? [
              { ...record, id: 1, albumName: 'A compilation' },
              { ...record, id: 2, albumName: 'First light (Deluxe Edition)' },
            ]
          : { ...record, id: 1, albumName: 'A compilation' },
      ),
    }),
  );
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  await full.getByRole('button', { name: 'Search again' }).click();
  await expect(full.getByRole('link', { name: 'LRCLIB' })).toHaveAttribute(
    'href',
    'https://lrclib.net/lyrics/2',
  );
  await expect(
    full.getByRole('button', { name: 'Seek to lyric: Matched album verse' }),
  ).toBeVisible();
});
test('Privacy uses the exact Wave background and follows appearance changes from another tab', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const base = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--background'),
  );
  await page.goto('/privacy.html');
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg')),
  ).toBe(base);
  const other = await context.newPage();
  await other.goto('/');
  // Wait for initial palette application before simulating a later storage change.
  await expect
    .poll(() => other.evaluate(() => document.documentElement.style.getPropertyValue('--wave-hue')))
    .toBe('226');
  await other.evaluate(() => {
    localStorage.setItem('wave-theme', 'light');
    localStorage.setItem('wave-palette', JSON.stringify({ hue: 122, saturation: '30%' }));
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--hue')))
    .toBe('122');
  await expect(page.getByRole('heading', { name: 'Privacy & rights', exact: true })).toBeVisible();
  await other.close();
});
test('a mix is announced before it happens, then the sleeve splits and the join follows', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  // Jump to twenty seconds before the end of the file: that is the lead-in.
  await page.evaluate(() => {
    const playing = (window as unknown as { __refineAudio: HTMLAudioElement[] }).__refineAudio.find(
      (a) => !a.paused,
    )!;
    playing.currentTime = playing.duration - 19;
  });
  await expect(full.locator('.mix-cue')).toBeVisible();
  await expect(full.getByText('Mixing', { exact: true })).toBeVisible();
  await expect(full.locator('.mix-cue-next')).toHaveCount(1);
  // The cue is not a static picture: the split opens as the join approaches.
  const before = await full
    .locator('.mix-cue')
    .evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--cue-open')));
  await page.evaluate(() => {
    const playing = (window as unknown as { __refineAudio: HTMLAudioElement[] }).__refineAudio.find(
      (a) => !a.paused,
    )!;
    playing.currentTime = playing.duration - 2;
  });
  await expect
    .poll(() =>
      full
        .locator('.mix-cue')
        .evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--cue-open'))),
    )
    .toBeGreaterThan(before);
});

test('the transport stays on screen while a song plays, and an idle room opens no scene', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, true);
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  await page.clock.install();
  await full.getByRole('button', { name: 'Play' }).click();
  // Five still seconds with the song running: the transport does not go away.
  await page.clock.fastForward(5000);
  await expect(full.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(full.getByRole('slider', { name: 'Seek', exact: true })).toBeVisible();
  await expect(page.locator('.player-modal')).not.toHaveClass(/controls-idle/);

  // The long idle changes nothing: no scene opens over the player and the
  // transport is still where it was.
  await page.clock.fastForward(26000);
  await expect(page.locator('.player-modal')).toBeVisible();
  await expect(full.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(full.getByRole('slider', { name: 'Seek', exact: true })).toBeVisible();
});

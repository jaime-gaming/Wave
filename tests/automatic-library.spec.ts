import { settingsMenu, closeSettings } from './helpers/settings';
import { test, expect, type Page } from '@playwright/test';
import { wav } from './helpers/audio';
async function start(page: Page) {
  await page.route('https://lrclib.net/api/**', (r) => r.fulfill({ status: 404, body: '{}' }));
  await page.addInitScript(() => {
    const N = window.Audio,
      all: HTMLAudioElement[] = [];
    Object.defineProperty(window, '__automaticAudio', { value: all });
    window.Audio = class extends N {
      constructor(src?: string) {
        super(src);
        all.push(this);
      }
    };
  });
  await page.goto('/');
}
test('queue completion continues actual playback with local variety and repeat retains priority', async ({
  page,
}) => {
  await start(page);
  await page.getByLabel('Import audio files').setInputFiles(
    ['Signal', 'Next', 'Last'].map((title) => ({
      name: title + '.wav',
      mimeType: 'audio/wav',
      buffer: wav(title, 60),
    })),
  );
  await expect(page.getByRole('status')).toContainText('3 tracks added');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Playback');
  await expect(page.getByRole('switch', { name: 'Autoplay', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('switch', { name: 'Mix', exact: true }).click();
  await closeSettings(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await page.getByRole('searchbox').fill('Signal');
  await page.getByRole('button', { name: 'Play Signal by Wave Tests', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __automaticAudio: HTMLAudioElement[] }).__automaticAudio.some(
          (a) => !a.paused && a.currentTime > 0.1,
        ),
      ),
    )
    .toBe(true);
  const footer = page.getByRole('contentinfo', { name: 'Music player' });
  await footer.getByRole('button', { name: 'Repeat: off' }).click();
  await footer.getByRole('button', { name: 'Repeat: all' }).click();
  await page.evaluate(() => {
    const a = (window as unknown as { __automaticAudio: HTMLAudioElement[] }).__automaticAudio.find(
      (a) => !a.paused,
    )!;
    a.currentTime = 59.8;
    a.dispatchEvent(new Event('timeupdate'));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __automaticAudio: HTMLAudioElement[] }).__automaticAudio.find(
            (a) => !a.paused,
          )?.currentTime ?? 60,
      ),
    )
    .toBeLessThan(2);
  await expect(footer.locator('.compact-title-open strong')).toHaveText('Signal');
  await footer.getByRole('button', { name: 'Repeat: one' }).click();
  await page.evaluate(() => {
    const a = (window as unknown as { __automaticAudio: HTMLAudioElement[] }).__automaticAudio.find(
      (a) => !a.paused,
    )!;
    a.currentTime = 59.8;
    a.dispatchEvent(new Event('timeupdate'));
  });
  await expect(footer.locator('.compact-title-open strong')).not.toHaveText('Signal');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __automaticAudio: HTMLAudioElement[] }).__automaticAudio.some(
          (a) => !a.paused && a.currentTime > 0.1,
        ),
      ),
    )
    .toBe(true);
  await footer.getByRole('button', { name: 'Show queue', exact: true }).click();
  await expect(page.locator('.queue-entry')).toHaveCount(3);
});
test('large mobile collections parse off-thread and expose bounded metadata review with responsive controls', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 320, height: 568 });
  let workers = 0;
  page.on('worker', () => workers++);
  await start(page);
  await page.getByLabel('Import audio files').setInputFiles(
    Array.from({ length: 150 }, (_, i) => ({
      name: `Song ${i}.wav`,
      mimeType: 'audio/wav',
      buffer: wav(`Song ${i}`, 8),
    })),
  );
  await expect(page.getByRole('status')).toContainText('150 tracks added', { timeout: 45000 });
  expect(workers).toBeGreaterThan(0);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await expect(page.locator('.song-row')).toHaveCount(150);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Library management');
  const section = page.getByRole('region', { name: 'Local metadata' });
  await expect(section.locator('li')).toHaveCount(8);
  await expect(section.getByRole('button', { name: 'Next metadata page' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.music-lighting').first()).toHaveCSS('display', 'none');
});
test('lyrics resolve decorated dash-prefixed titles and verified collaboration credits, retaining edition safety', async ({
  page,
}) => {
  await start(page);
  await page.route('https://lrclib.net/api/**', (r) =>
    r.fulfill({
      json: {
        id: 84,
        trackName: 'Signal',
        artistName: 'Wave Tests feat. Other',
        albumName: 'First light',
        duration: 90,
        syncedLyrics: '[00:00]A verified collaborative verse\n[00:05]The next line',
        plainLyrics: 'A verified collaborative verse\nThe next line',
      },
    }),
  );
  await page.getByLabel('Import audio files').setInputFiles({
    name: 'Signal.wav',
    mimeType: 'audio/wav',
    buffer: wav('Signal (Official Lyric Video 4K)', 90, 8000, 16, 'Wave Tests & Other'),
  });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page
    .getByRole('button', {
      name: 'Play Signal (Official Lyric Video 4K) by Wave Tests & Other',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  await full.getByRole('button', { name: /Search online|Search again/ }).click();
  await expect(
    full.getByRole('button', { name: 'Seek to lyric: A verified collaborative verse' }),
  ).toBeVisible();
  await expect(full.getByRole('link', { name: 'LRCLIB' })).toHaveAttribute(
    'href',
    'https://lrclib.net/lyrics/84',
  );
});

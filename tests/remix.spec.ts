import { test, expect } from './helpers/returning-user';
import { wav } from './helpers/audio';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wave-mix-v2', 'false');
    localStorage.setItem('wave-autoplay', 'false');
    const Native = window.Audio;
    const elements: HTMLAudioElement[] = [];
    Object.defineProperty(window, '__audio', { value: elements });
    window.Audio = class extends Native {
      constructor(src?: string) {
        super(src);
        elements.push(this);
      }
    };
  });
  await page.route('https://lrclib.net/api/**', (r) => r.fulfill({ status: 404, body: '{}' }));
  await page.goto('/');

  await expect(page.getByLabel('Import audio files')).toBeEnabled();
  await page.getByLabel('Import audio files').setInputFiles(
    ['Alpha', 'Beta'].map((title) => ({
      name: `${title}.wav`,
      mimeType: 'audio/wav',
      buffer: wav(title, 8),
    })),
  );
  await expect(page.getByRole('status')).toContainText('2 tracks added');
});

async function hear(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: `Play ${title} by Wave Tests` }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __audio: HTMLAudioElement[] }).__audio.some(
          (a) => !a.paused && a.currentTime > 0.3,
        ),
      ),
    )
    .toBe(true);

  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as { __audio: HTMLAudioElement[] }).__audio.some(
            (a) => !a.paused && a.currentTime >= 6.5,
          ),
        ),
      { timeout: 15000 },
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
}

test('Remix shows the week, plays its list and keeps the list as a playlist', async ({ page }) => {
  await hear(page, 'Alpha');
  await page.getByRole('button', { name: 'Remix', exact: true }).click();
  await page.getByRole('button', { name: /Listening time/ }).click();
  const week = page.locator('#remix-time-panel');
  await expect(week).toBeVisible();
  await expect(week).toContainText('1 play');
  await expect(week).toContainText('1 song');

  await expect(page.locator('.remix-page svg.recharts-surface')).toHaveCount(0);
  await expect(page.getByRole('list', { name: /recent/i })).toHaveCount(0);

  const remix = page.getByRole('region', { name: 'Your Remix' });
  await expect(remix.getByRole('listitem')).toHaveCount(1);
  await expect(remix).toContainText('Alpha');

  await remix.getByRole('button', { name: 'Save as playlist' }).click();

  await expect(page.getByRole('heading', { name: /^Remix ·/ }).first()).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Alpha' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Remix', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your Remix' })).toBeVisible();
});

test('Play Remix starts the list from its first song', async ({ page }) => {
  await hear(page, 'Beta');
  await page.getByRole('button', { name: 'Remix', exact: true }).click();
  await page.getByRole('button', { name: 'Play Remix' }).click();
  const footer = page.getByRole('contentinfo', { name: 'Music player' });
  await expect(footer).toContainText('Beta');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('an empty Remix invites a first song instead of showing a broken week', async ({ page }) => {
  await page.getByRole('button', { name: 'Remix', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No week to look back on yet' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'This week', exact: true })).toHaveCount(0);
});

test('clearing the history empties the week after confirmation', async ({ page }) => {
  await hear(page, 'Alpha');
  await page.getByRole('button', { name: 'Remix', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your Remix' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear history' }).click();
  await page
    .getByRole('group', { name: 'Clear listening history' })
    .getByRole('button', {
      name: 'Yes, clear',
    })
    .click();
  await expect(page.getByRole('heading', { name: 'No week to look back on yet' })).toBeVisible();
});

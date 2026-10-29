/**
 * Captures the images the README and the documentation pages show.
 *
 * Run it against a running dev server with a Chromium available to Playwright:
 *
 *   npm run dev
 *   npm run capture:docs            # writes docs/media/*.png
 *
 * The library it photographs is disposable and generated: same albums, same
 * covers, same demo lyrics every time, in its own browser context. Nothing here
 * reads a real collection, and no image is a mockup.
 */
import { chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { wav } from '../tests/helpers/audio.ts';

const origin = process.env.WAVE_URL ?? 'http://127.0.0.1:5173';
const output = path.resolve('docs/media');

const albums = [
  {
    artist: 'Northbound',
    album: 'Night signals',
    genre: 'Electronic',
    color: '#7894be',
    titles: ['After hours', 'Slow motion', 'Open skies'],
  },
  {
    artist: 'Sunday Club',
    album: 'Soft light',
    genre: 'Jazz',
    color: '#d4a581',
    titles: ['First light', 'Blue room', 'Quiet streets'],
  },
  {
    artist: 'The Coastline',
    album: 'In the distance',
    genre: 'Rock',
    color: '#8eaa98',
    titles: ['Out of town', 'Paper maps', 'Home again'],
  },
];

const words = [
  'The city slows beneath the light',
  'We take the long way home tonight',
  'A little room to breathe again',
  'The quiet stays until the end',
  'We follow where the daylight goes',
  'And leave the windows open',
];

/** Fills the library with the demo albums, their covers and their lyrics. */
async function seedDemoLibrary(page: Page) {
  await page.goto(origin);
  await page.getByLabel('Import audio files').setInputFiles(
    albums.flatMap((entry) =>
      entry.titles.map((title) => ({
        name: `${title}.wav`,
        mimeType: 'audio/wav',
        buffer: wav(title, 120, 8000, 16, entry.artist, entry.album, entry.genre),
      })),
    ),
  );
  await page.getByRole('status').filter({ hasText: '9 tracks added' }).waitFor();
  await page.evaluate(
    async ({ albums, words }) => {
      const request = indexedDB.open('wave-library');
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction('tracks', 'readwrite');
      const store = tx.objectStore('tracks');
      const all = store.getAll();
      all.onsuccess = () => {
        for (const track of all.result) {
          const entry = albums.find((album: { artist: string }) => album.artist === track.artist);
          if (!entry) continue;
          track.artwork = cover(entry);
          track.lyrics = {
            raw: words.map((text, i) => `[00:${String(i * 5).padStart(2, '0')}]${text}`).join('\n'),
            lines: words.map((text, i) => ({ text, time: i * 5 })),
            offsetMs: 0,
            source: 'local',
          };
          store.put(track);
        }
      };
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      // The recap needs a week behind it, so the demo library gets a week of
      // listening written straight into the plays store: the same rows the
      // player writes, in the same shape, and nothing invented for the picture.
      const tracksInLibrary = await new Promise<{ id: string }[]>((resolve) => {
        const read = db.transaction('tracks').objectStore('tracks').getAll();
        read.onsuccess = () => resolve(read.result as { id: string }[]);
      });
      const playsTx = db.transaction('plays', 'readwrite');
      const day = 24 * 60 * 60 * 1000;
      const now = Date.now();
      tracksInLibrary.forEach((track, index) => {
        // The first tracks in the library were "played" more often; every play
        // sits inside the last week, spread over different evenings.
        const times = 4 - Math.floor(index / 3);
        for (let play = 0; play < times; play += 1) {
          const at = now - ((index * 5 + play * 3) % 6) * day - play * 3600_000;
          playsTx.objectStore('plays').put({
            id: `${track.id}:${at}`,
            trackId: track.id,
            at,
            seconds: 120 + index * 10,
            completed: play % 2 === 0,
          });
        }
      });
      await new Promise<void>((resolve, reject) => {
        playsTx.oncomplete = () => resolve();
        playsTx.onerror = () => reject(playsTx.error);
      });
      db.close();

      /** The three sleeve patterns, drawn once and shared by every song. */
      function cover(entry: { artist: string; album: string; color: string }) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 600;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = entry.color;
        ctx.fillRect(0, 0, 600, 600);
        ctx.fillStyle = '#15202d';
        ctx.globalAlpha = 0.85;
        if (entry.artist === 'Northbound') {
          for (let i = 0; i < 6; i++)
            ctx.fillRect(58 + i * 84, 130 + (i % 3) * 36, 32, 330 - (i % 3) * 36);
        } else if (entry.artist === 'Sunday Club') {
          ctx.beginPath();
          ctx.arc(300, 282, 150, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = entry.color;
          ctx.fillRect(0, 283, 600, 180);
        } else {
          for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(0, 170 + i * 45);
            ctx.lineTo(600, 70 + i * 65);
            ctx.lineTo(600, 100 + i * 65);
            ctx.lineTo(0, 200 + i * 45);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#15202d';
        ctx.font = '600 25px sans-serif';
        ctx.fillText(entry.artist.toUpperCase(), 40, 60);
        ctx.font = '600 30px sans-serif';
        ctx.fillText(entry.album.toUpperCase(), 40, 550);
        return canvas.toDataURL('image/jpeg', 0.88);
      }
    },
    { albums, words },
  );
}

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
await mkdir(output, { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
});
await context.addInitScript(() => {
  localStorage.setItem('wave-playback-session-v1', '');
  localStorage.setItem('wave-autoplay', 'false');
  localStorage.setItem('wave-animations-enabled', 'true');
});

const seed = await context.newPage();
await seedDemoLibrary(seed);
await seed.close();

const shot = async (page: Page, name: string) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(output, name) });
  console.log(`docs/media/${name}`);
};

const home = await context.newPage();
await home.goto(origin);
await home.waitForTimeout(1200);
await shot(home, 'home-desktop.png');

// Remix: the week and the list it earns, before anything is playing.
await home.getByRole('button', { name: 'Remix', exact: true }).click();
await home.waitForTimeout(900);
await shot(home, 'remix-desktop.png');
await home.getByRole('button', { name: 'Home', exact: true }).click();
await home.waitForTimeout(600);

await home.getByRole('button', { name: /Open Daily mix .*Electronic/ }).click();
await home.waitForTimeout(650);
await shot(home, 'daily-mix-desktop.png');

await home.getByRole('button', { name: 'Play mix', exact: true }).click();
await home.getByRole('button', { name: 'Open now playing', exact: true }).click();
await home.waitForTimeout(1500);
await shot(home, 'now-playing-desktop.png');

const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto(origin);
await mobile.waitForTimeout(1200);
await shot(mobile, 'home-mobile.png');
await mobile.getByRole('button', { name: 'Remix', exact: true }).click();
await mobile.waitForTimeout(900);
await shot(mobile, 'remix-mobile.png');

// A review pass photographs the layouts the docs do not show, so a change to the
// header or the bottom dock can be looked at instead of imagined. Off unless asked.
if (process.env.WAVE_REVIEW) {
  await mobile.getByRole('button', { name: 'Library', exact: true }).click();
  await mobile.waitForTimeout(800);
  await shot(mobile, 'review-mobile-library.png');
  await mobile.getByRole('button', { name: 'Home', exact: true }).click();
  await mobile.waitForTimeout(500);
  await mobile.getByRole('button', { name: /Play .*Electronic/ }).first().click();
  await mobile.waitForTimeout(900);
  await shot(mobile, 'review-mobile-playing.png');
  await mobile.getByRole('button', { name: 'Open now playing', exact: true }).click();
  await mobile.waitForTimeout(1200);
  await shot(mobile, 'review-mobile-player.png');
  await mobile.getByRole('button', { name: 'Close dialog' }).click();
  await mobile.waitForTimeout(600);
  for (const width of [1024, 820]) {
    await mobile.setViewportSize({ width, height: 900 });
    await mobile.waitForTimeout(700);
    await shot(mobile, `review-${width}.png`);
  }
}

await context.close();
await browser.close();
console.log('Documentation images written to docs/media/.');

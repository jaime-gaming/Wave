/** Capture the running web app with an isolated, original demo library. */
import { chromium, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { wav } from '../tests/helpers/audio.ts';

const origin = process.env.WAVE_URL ?? 'http://localhost:5173';
const output = path.resolve('.cache/promo-v2');
const scratch = path.resolve('.cache/promo-v2/raw');
await mkdir(output, { recursive: true });
await mkdir(scratch, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: scratch, size: { width: 1440, height: 900 } },
});
await context.addInitScript(() => {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  localStorage.setItem('wave-theme', 'light');
  localStorage.setItem('wave-editor-enabled', 'true');
  localStorage.removeItem('wave-playback-session-v1');
  localStorage.setItem('wave-mix-v2', 'false');
  localStorage.setItem('wave-autoplay', 'false');
  localStorage.setItem('wave-animations-enabled', 'true');
});
const errors: string[] = [];
const sourceErrors: string[] = [];
context.on('page', (page) => page.on('pageerror', (e) => errors.push(e.message)));
const seed = await context.newPage();
await seed.goto(origin);
const albums = [
  {
    artist: 'Northbound',
    album: 'Night signals',
    genre: 'Electronic',
    titles: ['After hours', 'Slow motion', 'Open skies'],
  },
  {
    artist: 'Sunday Club',
    album: 'Soft light',
    genre: 'Jazz',
    titles: ['First light', 'Blue room', 'Quiet streets'],
  },
  {
    artist: 'The Coastline',
    album: 'In the distance',
    genre: 'Rock',
    titles: ['Out of town', 'Paper maps', 'Home again'],
  },
];
await seed.getByLabel('Import audio files').setInputFiles(
  albums.flatMap((a) =>
    a.titles.map((title) => ({
      name: title + '.wav',
      mimeType: 'audio/wav',
      buffer: wav(title, 120, 8000, 16, a.artist, a.album, a.genre),
    })),
  ),
);
await seed.getByRole('status').filter({ hasText: '9 tracks added' }).waitFor();
await seed.evaluate(async () => {
  const request = indexedDB.open('wave-library');
  const db: IDBDatabase = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = db.transaction(['tracks', 'playlists'], 'readwrite'),
    store = tx.objectStore('tracks');
  const all = store.getAll();
  all.onsuccess = () => {
    for (const track of all.result) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 600;
      const ctx = canvas.getContext('2d')!;
      const color =
        track.artist === 'Northbound'
          ? '#7894be'
          : track.artist === 'Sunday Club'
            ? '#d4a581'
            : '#8eaa98';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 600, 600);
      ctx.fillStyle = '#15202d';
      ctx.globalAlpha = 0.85;
      if (track.artist === 'Northbound') {
        for (let i = 0; i < 6; i++)
          ctx.fillRect(58 + i * 84, 130 + (i % 3) * 36, 32, 330 - (i % 3) * 36);
      } else if (track.artist === 'Sunday Club') {
        ctx.beginPath();
        ctx.arc(300, 282, 150, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
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
      ctx.fillText(track.artist.toUpperCase(), 40, 60);
      ctx.font = '600 30px sans-serif';
      ctx.fillText(track.album.toUpperCase(), 40, 550);
      track.favorite = track.artist === 'Sunday Club';
      track.artwork = canvas.toDataURL('image/jpeg', 0.88);
      const words = [
        'The city slows beneath the light',
        'We take the long way home tonight',
        'A little room to breathe again',
        'The quiet stays until the end',
        'We follow where the daylight goes',
        'And leave the windows open',
      ];
      track.lyrics = {
        raw: words.map((text, i) => `[00:${String(i * 5).padStart(2, '0')}]${text}`).join('\n'),
        lines: words.map((text, i) => ({ text, time: i * 5 })),
        offsetMs: 0,
        source: 'local',
      };
      store.put(track);
    }
    tx.objectStore('playlists').put({
      id: 'promo-evening',
      name: 'Evening collection',
      description: 'A few favorites for the way home.',
      trackIds: all.result.filter((t) => t.artist === 'Northbound').map((t) => t.id),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  };
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
});
await seed.close();
const manifest: Record<
  string,
  { file: string; startAt: number; endAt: number; viewport: { width: number; height: number } }
> = {};
const sleep = (page: Page, ms: number) => page.waitForTimeout(ms);
async function cursor(page: Page) {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent =
      '#promo-cursor{position:fixed;top:75%;left:80%;width:22px;height:28px;z-index:2147483647;pointer-events:none;transition:left .35s cubic-bezier(.2,.7,.2,1),top .35s cubic-bezier(.2,.7,.2,1);filter:drop-shadow(0 2px 2px #0004)}';
    document.head.append(style);
    const el = document.createElement('div');
    el.id = 'promo-cursor';
    el.innerHTML =
      '<svg viewBox="0 0 24 30"><path d="M2 2 L2 24 L8 18 L13 28 L17 26 L12 16 L21 16 Z" fill="#fff" stroke="#394253" stroke-width="1.5"/></svg>';
    document.body.append(el);
  });
}
async function click(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Control not laid out');
  await page.evaluate(
    ({ x, y }) => {
      const c = document.querySelector<HTMLElement>('#promo-cursor');
      if (c) {
        c.style.left = x + 'px';
        c.style.top = y + 'px';
      }
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  await sleep(page, 380);
  await target.click();
  await sleep(page, 350);
}
async function playlist(page: Page) {
  await page.locator('.home-shortcut').filter({ hasText: 'Playlists' }).click();
  await page.locator('.playlist-card').filter({ hasText: 'Evening collection' }).click();
}
async function record(
  name: string,
  prepare: (p: Page) => Promise<void>,
  actions: (p: Page) => Promise<void>,
  width = 1440,
  height = 900,
) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await prepare(page);
  await sleep(page, 500);
  await cursor(page);
  const startAt = Date.now();
  await sleep(page, 600);
  await actions(page);
  await sleep(page, 1800);
  const endAt = Date.now();
  const video = page.video()!;
  await page.close();
  manifest[name] = { file: await video.path(), startAt, endAt, viewport: { width, height } };
  await writeFile(path.join(output, 'captures.json'), JSON.stringify(manifest, null, 2));
  console.log('Captured', name, Math.round((endAt - startAt) / 100) / 10 + 's');
}
await record(
  'collection',
  async () => {},
  async (p) => {
    await click(p, p.locator('.home-overview .tonal-button'));
    // System pickers are outside the screen recording; use the real import input.
    await p.getByLabel('Import audio files').setInputFiles({
      name: 'Harbor light.wav',
      mimeType: 'audio/wav',
      buffer: wav('Harbor light', 120, 8000, 16, 'Sunday Club', 'Soft light', 'Jazz'),
    });
    await sleep(p, 850);
    const dismiss = p.getByRole('button', { name: 'Dismiss notification' });
    if (await dismiss.isVisible()) await dismiss.click();
    await click(p, p.locator('.home-shortcut').filter({ hasText: 'Albums' }));
    await sleep(p, 1000);
    await click(p, p.locator('.group-card').filter({ hasText: 'Night signals' }));
    await sleep(p, 800);
  },
);
await record(
  'daily',
  async () => {},
  async (p) => {
    await click(p, p.locator('.daily-mix-card').filter({ hasText: 'Electronic' }));
    await sleep(p, 800);
    await p
      .locator('.song-list')
      .evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'smooth' }));
    await sleep(p, 1100);
    await click(p, p.getByRole('button', { name: 'Save as playlist', exact: true }));
    await sleep(p, 1100);
  },
);
await record(
  'search',
  async (p) => {
    await p.getByRole('button', { name: 'Search', exact: true }).click();
  },
  async (p) => {
    const search = p.getByRole('searchbox', { name: 'Search library' });
    await search.pressSequentially('Northbound', { delay: 75 });
    await sleep(p, 1100);
    await click(p, p.getByRole('button', { name: 'Options for After hours', exact: true }));
    await click(p, p.getByRole('button', { name: 'Edit song', exact: true }));
    await sleep(p, 1100);
    await click(p, p.getByRole('button', { name: 'Save changes', exact: true }));
  },
);
await record('ordering', playlist, async (p) => {
  await click(p, p.getByRole('button', { name: 'Reorder songs', exact: true }));
  await sleep(p, 600);
  const move = p.getByRole('button', { name: 'Move After hours up', exact: true });
  if (await move.isEnabled()) await click(p, move);
  else await click(p, p.getByRole('button', { name: 'Move Slow motion up', exact: true }));
  await sleep(p, 900);
  await click(p, p.getByRole('button', { name: 'Save order', exact: true }));
  await sleep(p, 600);
});
await record(
  'playback',
  async (p) => {
    await playlist(p);
    await p.locator('.song-title-button').first().click();
    await p.getByRole('button', { name: 'Open now playing', exact: true }).click();
  },
  async (p) => {
    await sleep(p, 4400);
    await click(
      p,
      p
        .getByRole('dialog', { name: 'Now playing', exact: true })
        .getByRole('button', { name: 'Next track', exact: true }),
    );
    await sleep(p, 1300);
  },
);
await record(
  'queue',
  async (p) => {
    await playlist(p);
    await p.locator('.song-title-button').first().click();
    await p.getByRole('button', { name: 'Show queue', exact: true }).click();
  },
  async (p) => {
    await click(p, p.getByRole('button', { name: 'Reorder queue', exact: true }));
    const up = p.getByRole('button', { name: 'Move After hours up', exact: true });
    if (await up.isEnabled()) await click(p, up);
    else await click(p, p.getByRole('button', { name: 'Move Slow motion up', exact: true }));
    await sleep(p, 1400);
  },
);
await record(
  'mix',
  async (p) => {
    await p.getByRole('button', { name: 'Open settings', exact: true }).click();
    await p.getByRole('button', { name: 'Playback', exact: true }).click();
  },
  async (p) => {
    await click(p, p.getByRole('switch', { name: 'Mix', exact: true }));
    await sleep(p, 600);
    await click(p, p.getByRole('switch', { name: 'Autoplay', exact: true }));
    await sleep(p, 1000);
  },
);
await record(
  'lyrics',
  async (p) => {
    await playlist(p);
    await p.locator('.song-title-button').first().click();
    await p.getByRole('button', { name: 'Open now playing', exact: true }).click();
  },
  async (p) => {
    await sleep(p, 7200);
  },
);
await record(
  'editor',
  async (p) => {
    await p.route('https://lrclib.net/api/**', (r) => {
      const q = new URL(r.request().url()).searchParams;
      return r.fulfill({
        json: {
          id: 100,
          trackName: q.get('track_name') ?? 'After hours',
          artistName: q.get('artist_name') ?? 'Northbound',
          albumName: 'Night signals',
          duration: 120,
          syncedLyrics:
            '[00:00]The city slows beneath the light\n[00:05]We take the long way home tonight\n[00:10]A little room to breathe again',
        },
      });
    });
    await playlist(p);
    await p.getByRole('button', { name: 'Options for After hours', exact: true }).click();
    await p.getByRole('button', { name: 'Edit lyrics', exact: true }).click();
  },
  async (p) => {
    await click(p, p.getByRole('button', { name: 'Search online', exact: true }));
    await p.getByRole('button', { name: 'Use found lyrics', exact: true }).waitFor();
    await sleep(p, 800);
    await click(p, p.getByRole('button', { name: 'Use found lyrics', exact: true }));
    await click(p, p.getByRole('button', { name: 'Save lyrics', exact: true }));
  },
);
await record(
  'appearance',
  async (p) => {
    await p.evaluate(() => {
      localStorage.setItem('wave-theme', 'dark');
      window.dispatchEvent(new StorageEvent('storage', { key: 'wave-theme', newValue: 'dark' }));
    });
    await p.getByRole('button', { name: 'Open settings', exact: true }).click();
    await p.getByRole('button', { name: 'Appearance', exact: true }).click();
  },
  async (p) => {
    await click(p, p.getByRole('button', { name: 'Light', exact: true }));
    await sleep(p, 900);
    await click(p, p.getByRole('switch', { name: 'Larger text', exact: true }));
    await sleep(p, 1100);
  },
);
await record(
  'mobile-home',
  async () => {},
  async (p) => {
    await sleep(p, 1400);
    await p.locator('.daily-mix-card').filter({ hasText: 'Rock' }).scrollIntoViewIfNeeded();
    await sleep(p, 1800);
  },
  390,
  844,
);
await record(
  'mobile-player',
  async (p) => {
    await playlist(p);
    await p.locator('.song-title-button').first().click();
    await p.getByRole('button', { name: 'Open now playing', exact: true }).click();
  },
  async (p) => {
    await sleep(p, 5400);
  },
  390,
  844,
);
await context.close();
await browser.close();
if (errors.length || sourceErrors.length) throw new Error([...errors, ...sourceErrors].join('\n'));
console.log('All real UI scenes captured.');

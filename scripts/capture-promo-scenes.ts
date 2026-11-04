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
context.on('page', (page) =>
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('::warning::page error: ' + e.message.replace(/\s+/g, ' ').slice(0, 300));
  }),
);
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
/** Scenes whose real controls could not be driven; reported, never silent. */
const failures: string[] = [];
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
  await target.click({ timeout: 8000 });
  await sleep(page, 350);
}
/** Opens Search, finds a song and plays it. */
async function play(page: Page, text: string) {
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search library' }).fill(text);
  await sleep(page, 700);
  await page.locator('.song-title-button').first().click();
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
  /*
   * A scene that goes wrong costs that scene, not the film.
   *
   * The selectors below are the app's real controls, so a rename or a moved
   * button shows up here first; failing the whole recording would then take the
   * other nine scenes down with it and leave nothing to review. The failure is
   * still printed, and it is written next to the manifest, because a film with a
   * missing moment must not pass for a film with all of them.
   */
  const page = await context.newPage();
  // The clock starts when the app is on screen and ready, not when the browser
  // has opened: the first seconds of a take are page load, and the film should
  // not spend its first beat on that.
  let startAt = Date.now();
  try {
    await page.setViewportSize({ width, height });
    await page.goto(origin);
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await prepare(page);
    await sleep(page, 500);
    await cursor(page);
    startAt = Date.now();
    await sleep(page, 600);
    await actions(page);
    await sleep(page, 1800);
  } catch (error) {
    // The whole message, folded onto one line: it names the control that would
    // not answer and why, which is the only diagnosis a headless run leaves.
    const detail = (error instanceof Error ? error.message : String(error))
      .replace(/\s+/g, ' ')
      .slice(0, 420);
    const message = `${name}: ${detail}`;
    failures.push(message);
    console.log('::warning::' + message);
  }
  const endAt = Date.now();
  const video = page.video();
  await page.close();
  if (!video) throw new Error('The browser recorded nothing for ' + name);
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
    // The import sheet stands over the page until it is dismissed; the notice
    // that follows lives behind it.
    await p.keyboard.press('Escape');
    await sleep(p, 400);
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
// Letters in the wrong place: the demo library has no artist called "Nothbound",
// and this release is about that not being a dead end.
await record(
  'search',
  async (p) => {
    await p.getByRole('button', { name: 'Search', exact: true }).click();
  },
  async (p) => {
    const search = p.getByRole('searchbox', { name: 'Search library' });
    await search.pressSequentially('Nothbound', { delay: 95 });
    await sleep(p, 1600);
    const result = p.locator('.group-card').filter({ hasText: 'Northbound' }).first();
    if (await result.isVisible()) await click(p, result);
    await sleep(p, 1200);
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

/*
 * The join, recorded where it is really heard.
 *
 * Mix and autoplay are switched on in Settings before the clock starts — the
 * switch is a setting, not the subject of the scene. Then the song is taken to
 * ten seconds before its end and left alone: what follows is the app's own
 * overlap, with its own cue, its own entry point and its own hand-over.
 */
const seek = (p: Page, seconds: number) =>
  p.evaluate((value) => {
    const input = document.querySelector<HTMLInputElement>(
      'input[type="range"][aria-label="Seek"]',
    );
    if (!input) throw new Error('The transport has no seek control');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, seconds);
await record(
  'blend',
  async (p) => {
    await p.getByRole('button', { name: 'Open settings', exact: true }).click();
    await p.getByRole('button', { name: 'Playback', exact: true }).click();
    for (const name of ['Mix', 'Autoplay']) {
      const control = p.getByRole('switch', { name, exact: true });
      if ((await control.getAttribute('aria-checked')) !== 'true') await control.click();
      await sleep(p, 250);
    }
    await p.keyboard.press('Escape');
    await sleep(p, 500);
    // The whole library, in order: a mix needs a next song, and a single result
    // from a search is a queue of one.
    await p
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Library', exact: true })
      .click();
    await p.getByRole('combobox', { name: 'Sort tracks' }).selectOption('title');
    await p.getByRole('button', { name: 'Play all songs', exact: true }).click();
    await p.getByRole('button', { name: 'Open now playing', exact: true }).click();
    await p.getByRole('dialog', { name: 'Now playing', exact: true }).waitFor();
    await sleep(p, 600);
  },
  async (p) => {
    // Two minutes of song, a join of about fourteen seconds that starts sixteen
    // seconds before the end. Fifteen seconds out, the take holds the cue, the
    // two decks together and the hand-over, at the speed they happen.
    await seek(p, 105);
    await sleep(p, 14_000);
  },
);
/*
 * Dead air at the start of a file.
 *
 * The fixture is the only made-up part: six silent seconds on each side of the
 * tone. The notice, its wording and its two answers are the app's.
 */
await record(
  'silence',
  async (p) => {
    await p.getByLabel('Import audio files').setInputFiles({
      name: 'Tidewater.wav',
      mimeType: 'audio/wav',
      buffer: wav('Tidewater', 60, 8000, 16, 'Sunday Club', 'Soft light', 'Jazz', 6),
    });
    await sleep(p, 900);
    const dismiss = p.getByRole('button', { name: 'Dismiss notification' });
    if (await dismiss.isVisible()) await dismiss.click();
    await p.getByRole('button', { name: 'Search', exact: true }).click();
    await p.getByRole('searchbox', { name: 'Search library' }).fill('Tidewater');
    await sleep(p, 700);
    await p.locator('.song-title-button').first().click();
  },
  async (p) => {
    const notice = p.getByRole('status').filter({ hasText: 'silence' }).first();
    await notice.waitFor({ timeout: 20_000 });
    await sleep(p, 1400);
    await click(p, p.getByRole('button', { name: 'Remove it', exact: true }));
    await sleep(p, 1400);
  },
);
await record(
  'lyrics',
  async (p) => {
    await play(p, 'After hours');
    await p.getByRole('button', { name: 'Open now playing', exact: true }).click();
  },
  async (p) => {
    await sleep(p, 7200);
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
  async (p) => {
    await p.evaluate(() => {
      localStorage.setItem('wave-theme', 'dark');
      window.dispatchEvent(new StorageEvent('storage', { key: 'wave-theme', newValue: 'dark' }));
    });
  },
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
    await p.evaluate(() => {
      localStorage.setItem('wave-theme', 'light');
      window.dispatchEvent(new StorageEvent('storage', { key: 'wave-theme', newValue: 'light' }));
    });
    await play(p, 'After hours');
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
const expected = [
  'collection',
  'daily',
  'search',
  'ordering',
  'blend',
  'lyrics',
  'silence',
  'appearance',
  'mobile-home',
  'mobile-player',
];
for (const name of expected) if (!manifest[name]) failures.push(`${name}: never recorded`);
await writeFile(
  path.join(output, 'capture-failures.txt'),
  failures.length ? failures.join('\n') + '\n' : '',
);
// A page error is a real defect in the app under the camera, not a lost take: it
// is already annotated above, and it is written down with the rest. The browser
// suite is the gate that fails a build over it; a film that renders anyway is
// still worth reviewing.
if (errors.length || sourceErrors.length) {
  await writeFile(
    path.join(output, 'capture-failures.txt'),
    [...failures, ...errors.map((e) => 'page error: ' + e), ...sourceErrors].join('\n') + '\n',
  );
}
console.log(
  failures.length
    ? `Captured every scene; ${failures.length} could not be driven: ${failures.join('; ')}`
    : 'All real UI scenes captured.',
);

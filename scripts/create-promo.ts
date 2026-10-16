/** Capture the running web app with an isolated, original demo library. */
import { chromium, type Locator } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { wav } from '../tests/helpers/audio.ts';

const origin = process.env.WAVE_URL ?? 'http://localhost:5173';
const output = path.resolve('docs/media');
const scratch = path.resolve('.cache/promo');
await mkdir(output, { recursive: true });
await mkdir(scratch, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: scratch, size: { width: 1920, height: 1080 } },
});
await context.addInitScript(() => {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  localStorage.setItem('wave-theme', 'dark');
  localStorage.setItem('wave-mix-v2', 'false');
  localStorage.setItem('wave-autoplay', 'false');
  localStorage.setItem('wave-animations-enabled', 'true');
});
const errors: string[] = [];
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
  const tx = db.transaction('tracks', 'readwrite'),
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
  };
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
});
await seed.close();
const logo = (await readFile('public/wave.svg', 'utf8')).replace(/<\?xml[^>]*>/, '');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Nunito;src:url('/node_modules/@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2')}*{box-sizing:border-box}body{width:1280px;height:720px;position:relative;transform:scale(1.5);transform-origin:top left;margin:0;background:#10131b;color:#e8ebf7;font-family:Nunito,sans-serif;overflow:hidden}header{position:absolute;left:34px;top:38px;display:flex;align-items:center;gap:12px;font-size:28px;font-weight:800}header svg{width:40px;height:38px}.version{position:absolute;left:34px;top:96px;color:#aeb9d0;font-size:14px;letter-spacing:1px}#copy{position:absolute;left:34px;top:242px;width:254px;transition:opacity .25s,transform .25s}h1{font-size:42px;line-height:1.12;letter-spacing:-1.5px;margin:0 0 22px;font-weight:800}#description{font-size:19px;line-height:1.5;color:#aeb9d0;white-space:pre-line}#device{position:absolute;left:318px;top:52px;width:930px;height:604px;border:1px solid #384253;border-radius:24px;overflow:hidden;box-shadow:0 18px 60px #0004;transform:translateY(14px);opacity:0;animation:appear .9s 2.4s forwards}iframe{border:0;width:calc(100% / .85);height:calc(100% / .85);transform:scale(.85);transform-origin:top left;background:#10131b}footer{position:absolute;left:34px;bottom:28px;font-size:16px;color:#b6c8ff}.footnote{position:absolute;right:34px;bottom:28px;color:#7d889f;font-size:13px}#cursor{position:absolute;left:970px;top:620px;width:22px;height:28px;z-index:5;pointer-events:none;transition:left .5s cubic-bezier(.2,.7,.2,1),top .5s cubic-bezier(.2,.7,.2,1)}#cursor svg{width:100%;height:100%}#ring{position:absolute;width:36px;height:36px;border:2px solid #b6c8ff;border-radius:50%;top:-10px;left:-12px;opacity:0}#intro{position:absolute;inset:0;background:#10131b;z-index:10;display:flex;align-items:center;justify-content:center;gap:28px;animation:introOut .6s 2.2s forwards}#intro svg{width:130px;height:130px}#intro strong{font-size:84px;letter-spacing:-3px}#intro path{stroke-dasharray:600;stroke-dashoffset:600;animation:draw 1.4s .1s forwards}#outro{position:absolute;inset:0;background:#10131b;z-index:20;display:none;align-items:center;justify-content:center;flex-direction:column}#outro svg{width:100px;height:100px}#outro strong{font-size:66px;letter-spacing:-2px}#outro p{font-size:24px;color:#b6c8ff;margin:18px}#outro small{font-size:18px;color:#aeb9d0}@keyframes draw{to{stroke-dashoffset:0}}@keyframes introOut{to{opacity:0;visibility:hidden}}@keyframes appear{to{opacity:1;transform:none}}
</style></head><body><header>${logo}<span>Wave</span></header><div class="version">0.1.0 · 16 OCTOBER 2026</div><section id="copy"><h1 id="title">Your local<br>collection.</h1><div id="description">Bring your audio files.<br>No account required.</div></section><div id="device"><iframe src="/"></iframe></div><footer>github.com/jaime-gaming/Wave</footer><span class="footnote">Web app demo · Original demo library</span><div id="cursor"><span id="ring"></span><svg viewBox="0 0 24 30"><path d="M2 2 L2 24 L8 18 L13 28 L17 26 L12 16 L21 16 Z" fill="#f1f4ff" stroke="#10131b" stroke-width="1.8"/></svg></div><div id="intro">${logo}<strong>Wave</strong></div><div id="outro">${logo}<strong>Wave</strong><p>github.com/jaime-gaming/Wave</p><small>Local music. No account. Open source.</small></div></body></html>`;
const page = await context.newPage();
await page.route('**/__wave_promo__', (route) =>
  route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }),
);
await page.goto(origin + '/__wave_promo__');
const frame = page.frameLocator('iframe');
await frame.getByRole('heading', { name: 'Home', exact: true }).waitFor();
const pause = (ms: number) => page.waitForTimeout(ms);
async function caption(title: string, description: string) {
  await page.evaluate(
    ({ title, description }) => {
      const copy = document.querySelector<HTMLElement>('#copy')!;
      copy.style.opacity = '0';
      copy.style.transform = 'translateY(8px)';
      setTimeout(() => {
        document.querySelector('#title')!.textContent = title;
        document.querySelector('#description')!.textContent = description;
        copy.style.opacity = '1';
        copy.style.transform = 'none';
      }, 250);
    },
    { title, description },
  );
}
async function point(target: Locator, click = true) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Demo control is outside layout');
  await page.evaluate(
    ({ x, y }) => {
      const cursor = document.querySelector<HTMLElement>('#cursor')!;
      cursor.style.left = x + 'px';
      cursor.style.top = y + 'px';
    },
    { x: (box.x + box.width / 2) / 1.5, y: (box.y + box.height / 2) / 1.5 },
  );
  await pause(650);
  if (click) {
    await page.locator('#ring').evaluate((el) =>
      el.animate(
        [
          { opacity: 0.9, transform: 'scale(.5)' },
          { opacity: 0, transform: 'scale(1.7)' },
        ],
        { duration: 450 },
      ),
    );
    await target.click();
  }
  await pause(350);
}
await pause(4200);
await caption('Add your music.', 'Import from your device.\nKeep the original files.');
await point(frame.locator('.home-overview .tonal-button'), false);
await frame.getByLabel('Import audio files').setInputFiles({
  name: 'Harbor light.wav',
  mimeType: 'audio/wav',
  buffer: wav('Harbor light', 120, 8000, 16, 'Sunday Club', 'Soft light', 'Jazz'),
});
await pause(2200);
const dismiss = frame.getByRole('button', { name: 'Dismiss notification' });
if (await dismiss.isVisible()) await dismiss.click();
await caption('Open a daily mix.', 'Browse the songs first.\nMade from your local tags.');
await point(frame.locator('.daily-mix-card').filter({ hasText: 'Electronic' }));
await pause(1900);
await point(frame.getByRole('button', { name: 'Play mix', exact: true }));
await pause(1600);
await caption('Keep this selection.', 'Save a mix as a playlist.\nMake it your own.');
await point(frame.getByRole('button', { name: 'Save as playlist', exact: true }));
await pause(2300);
await caption('Follow the words.', 'Synchronized lyrics.\nSaved for offline listening.');
await point(frame.getByRole('button', { name: 'Open now playing', exact: true }));
await pause(5500);
await point(
  frame
    .getByRole('dialog', { name: 'Now playing', exact: true })
    .getByRole('button', { name: 'Close dialog', exact: true }),
);
await caption('Make it yours.', 'Light or dark.\nYour preferred text size.');
await point(frame.getByRole('button', { name: 'Open settings', exact: true }));
await point(frame.getByRole('button', { name: 'Appearance', exact: true }));
await point(frame.getByRole('button', { name: 'Light', exact: true }));
await pause(2400);
await page.evaluate(() => {
  const outro = document.querySelector<HTMLElement>('#outro')!;
  outro.style.display = 'flex';
  outro.animate(
    [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 600 },
  );
});
await pause(3600);
const video = page.video()!;
await page.close();
const rawVideo = await video.path();
// Actual screenshots, never mockups. Each page uses the same isolated demo data.
const shots = await context.newPage();
await shots.addInitScript(() => localStorage.removeItem('wave-playback-session-v1'));
await shots.setViewportSize({ width: 1440, height: 960 });
await shots.goto(origin);
await shots.evaluate(() => document.fonts.ready);
await shots.waitForTimeout(1400);
await shots.screenshot({ path: path.join(output, 'home-desktop.png') });
await shots.getByRole('button', { name: /Open Daily mix .*Electronic/ }).click();
await shots.waitForTimeout(650);
await shots.screenshot({ path: path.join(output, 'daily-mix-desktop.png') });
await shots.getByRole('button', { name: 'Play mix', exact: true }).click();
await shots.getByRole('button', { name: 'Open now playing', exact: true }).click();
await shots.waitForTimeout(1400);
await shots.screenshot({ path: path.join(output, 'now-playing-desktop.png') });
await shots
  .getByRole('dialog', { name: 'Now playing', exact: true })
  .getByRole('button', { name: 'Close dialog', exact: true })
  .click();
await shots.close();
const mobile = await context.newPage();
await mobile.addInitScript(() => localStorage.removeItem('wave-playback-session-v1'));
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto(origin);
await mobile.waitForTimeout(1400);
await mobile.screenshot({ path: path.join(output, 'home-mobile.png') });
await mobile.close();
await context.close();
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
const ffmpeg = process.env.FFMPEG_BIN ?? 'ffmpeg';
execFileSync(
  ffmpeg,
  [
    '-y',
    '-i',
    rawVideo,
    '-an',
    '-vf',
    'fps=30,format=yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    '-metadata',
    'title=Wave 0.1.0',
    '-metadata',
    'comment=Screen recording of the Wave web client',
    '-map_metadata',
    '-1',
    path.join(output, 'wave-0.1.0-promo.mp4'),
  ],
  { stdio: 'inherit' },
);
console.log('Captured Wave demo and README screenshots.');

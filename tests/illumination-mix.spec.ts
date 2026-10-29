import { settingsMenu, closeSettings } from './helpers/settings';
import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('wave-autoplay') === null)
      localStorage.setItem('wave-autoplay', 'false');
  });
});

import { wav } from './helpers/audio';
async function setup(
  page: Page,
  { mix = false, covers = false }: { mix?: boolean; covers?: boolean } = {},
) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(
    ({ mix }) => {
      if (localStorage.getItem('wave-mix-v2') === null)
        localStorage.setItem('wave-mix-v2', String(mix));
      const Native = window.Audio,
        all: HTMLAudioElement[] = [];
      Object.defineProperty(window, '__mixAudio', { value: all });
      window.Audio = class extends Native {
        constructor(src?: string) {
          super(src);
          all.push(this);
        }
      };
    },
    { mix },
  );
  await page.route('https://lrclib.net/api/**', (r) => r.fulfill({ status: 404, body: '{}' }));
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles(
    ['A', 'B', 'C'].map((title) => {
      const duration = mix ? 20 : 120,
        buffer = wav(title, duration),
        offset = buffer.indexOf(Buffer.from('data')) + 8;
      if (mix && title === 'A') buffer.fill(0, offset + 18 * 8000 * 2);
      if (mix && title === 'B') buffer.fill(0, offset, offset + 2 * 8000 * 2);
      return { name: `${title}.wav`, mimeType: 'audio/wav', buffer };
    }),
  );
  await expect(page.getByRole('status')).toContainText('3 tracks added');
  if (covers) {
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open('wave-library');
        r.onsuccess = () => resolve(r.result);
      });
      const tx = db.transaction('tracks', 'readwrite'),
        store = tx.objectStore('tracks'),
        r = store.getAll();
      r.onsuccess = () => {
        for (const track of r.result) {
          const c = document.createElement('canvas');
          c.width = c.height = 24;
          const ctx = c.getContext('2d')!;
          ctx.fillStyle =
            track.title === 'A' ? '#cf4848' : track.title === 'B' ? '#4848cf' : '#48cf48';
          ctx.fillRect(0, 0, 24, 24);
          store.put({ ...track, artwork: c.toDataURL() });
        }
      };
      await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
      db.close();
    });
    await page.reload();
  }
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Sort tracks' }).selectOption('title');
  await page.getByRole('button', { name: 'Play all songs', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __mixAudio: HTMLAudioElement[] }).__mixAudio.some(
          (a) => !a.paused && a.currentTime > 0.2,
        ),
      ),
    )
    .toBe(true);
}
const playing = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as { __mixAudio: HTMLAudioElement[] }).__mixAudio.find(
      (a) => !a.paused,
    )!;
    return { src: a.src, time: a.currentTime };
  });
test('queue reordering preserves native playback and survives reload, with keyboard and drag controls', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: 'Show queue', exact: true }).click();
  const queue = page.getByRole('dialog', { name: 'Queue', exact: true }),
    titles = queue.locator('.queue-entry__info strong');
  await expect(titles).toHaveText(['A', 'B', 'C']);
  const before = await playing(page);
  await queue.getByRole('button', { name: 'Reorder queue', exact: true }).click();
  await queue.getByRole('button', { name: 'Move A down', exact: true }).click();
  await expect(titles).toHaveText(['B', 'A', 'C']);
  expect((await playing(page)).src).toBe(before.src);
  expect((await playing(page)).time).toBeGreaterThanOrEqual(before.time);
  const handle = queue.getByRole('button', { name: 'Drag A to reorder' });
  await handle.press('Alt+ArrowDown');
  await expect(titles).toHaveText(['B', 'C', 'A']);
  await expect(queue.locator('[aria-live="polite"]')).toHaveText('A, position 3 of 3');
  const drag = queue.getByRole('button', { name: 'Drag B to reorder' }),
    box = await drag.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 85, { steps: 12 });
  await page.mouse.up();
  await expect(titles).toHaveText(['C', 'B', 'A']);
  for (const [width, height] of [
    [320, 568],
    [700, 360],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    expect(await queue.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await page.reload();
  await page.getByRole('button', { name: 'Show queue', exact: true }).click();
  await expect(titles).toHaveText(['C', 'B', 'A']);
  await expect(queue.locator('[aria-current="true"] .queue-entry__info strong')).toHaveText('A');
});
test('right-click offers track and general actions, bounded placement and keyboard focus', async ({
  page,
}) => {
  await setup(page);
  const row = page
    .locator('.song-row')
    .filter({ has: page.getByRole('button', { name: 'Play A by Wave Tests', exact: true }) });
  const opener = row.getByRole('button', { name: 'Play A by Wave Tests', exact: true });
  await opener.focus();
  await opener.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'A', exact: true });
  await expect(menu.getByRole('menuitem', { name: 'Already in queue' })).toBeDisabled();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Song options' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem', { name: 'Play song', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Add to favorites', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Unfavorite A' })).toBeVisible();
  await expect(opener).toBeFocused();
  await opener.press('Shift+F10');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.mouse.click(310, 555, { button: 'right' });
  const dialog = page.locator('.context-menu');
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 8 && r.top >= 8 && r.right <= innerWidth - 7 && r.bottom <= innerHeight - 7;
    }),
  ).toBe(true);
  await page.mouse.click(20, 20);
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.workspace h1').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
  await page
    .getByRole('heading', { name: 'Settings', exact: true })
    .click({ button: 'right', modifiers: ['Shift'] });
  await expect(dialog).toHaveCount(0);
  await closeSettings(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await page.getByRole('searchbox').click({ button: 'right' });
  await expect(dialog).toHaveCount(0);
});
test('absence hides the entire lower UI and wakes without interrupting native playback', async ({
  page,
}) => {
  await setup(page, { covers: true });
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  await page.clock.install();
  await page.mouse.move(40, 40);
  await page.clock.fastForward(30001);
  await expect(page.locator('.immersive-stage')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-immersive', 'true');
  for (const selector of [
    '.player-bar',
    '.navigation-shell',
    '.workspace',
    '.player-normal-view',
    '.player-normal-view .stage-transport',
  ])
    await expect(page.locator(selector)).toHaveCSS('visibility', 'hidden');
  const source = (await playing(page)).src;
  await page.mouse.move(60, 60);
  await page.clock.runFor(500);
  await expect(page.locator('html')).toHaveAttribute('data-immersive', 'false');
  await expect(page.locator('.player-normal-view .stage-transport')).toBeVisible();
  expect((await playing(page)).src).toBe(source);
});
test('mix uses silence-safe cue points and animates artwork palette over real two-deck overlap', async ({
  page,
}) => {
  await setup(page, { mix: true, covers: true });
  await expect
    .poll(() =>
      page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--wave-hue'))),
    )
    .toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __mixAudio: HTMLAudioElement[] }).__mixAudio.some(
          (a) => !a.paused && a.currentTime > 1,
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  await page.evaluate(() => {
    const a = (window as unknown as { __mixAudio: HTMLAudioElement[] }).__mixAudio.find(
      (a) => !a.paused,
    )!;
    a.currentTime = 14.4;
    a.dispatchEvent(new Event('timeupdate'));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __mixAudio: HTMLAudioElement[] }).__mixAudio.filter(
            (a) => !a.paused,
          ).length,
      ),
    )
    .toBe(2);
  await expect(page.locator('html')).toHaveAttribute('data-palette-transition', 'mix');
  const data = await page.evaluate(() => {
    const all = (window as unknown as { __mixAudio: HTMLAudioElement[] }).__mixAudio.filter(
      (a) => !a.paused,
    );
    return {
      incoming: Math.min(...all.map((a) => a.currentTime)),
      power: all.reduce((sum, a) => sum + a.volume ** 2, 0),
    };
  });
  expect(data.incoming).toBeGreaterThanOrEqual(1.8);
  expect(data.power).toBeCloseTo(1, 3);
  const hue = await page.locator('html').evaluate((el) => el.style.getPropertyValue('--wave-hue'));
  await expect
    .poll(() => page.locator('html').evaluate((el) => el.style.getPropertyValue('--wave-hue')))
    .not.toBe(hue);
  await expect(page.locator('.stage-aura i')).toHaveCount(3);
  await expect(page.locator('.stage-aura svg')).toHaveCount(0);
  expect(
    await page
      .locator('.stage-aura .music-lighting__bass')
      .evaluate((el) => getComputedStyle(el).backgroundImage),
  ).toContain('radial-gradient');
  await page.evaluate(() => {
    const incoming = (window as unknown as { __mixAudio: HTMLAudioElement[] }).__mixAudio
      .filter((a) => !a.paused)
      .sort((a, b) => a.currentTime - b.currentTime)[0];
    incoming.currentTime = 7;
    incoming.dispatchEvent(new Event('timeupdate'));
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-palette-transition', 'mix');
  await expect
    .poll(() =>
      page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--wave-hue'))),
    )
    .toBe(240);
  await page
    .getByRole('dialog', { name: 'Now playing' })
    .getByRole('button', { name: 'Pause', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--wave-hue'))),
    )
    .toBe(226);
});
test('Mix can be disabled and remembered without a manual duration control', async ({ page }) => {
  await setup(page, { mix: true });
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Playback');
  const settings = page.getByRole('region', { name: 'Settings', exact: true }),
    toggle = settings.getByRole('switch', { name: 'Mix', exact: true });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await page.reload();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await settingsMenu(page, 'Playback');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(settings.getByRole('slider')).toHaveCount(0);
  await closeSettings(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Sort tracks' }).selectOption('title');
  await page.getByRole('button', { name: 'Play all songs', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __mixAudio: HTMLAudioElement[] }).__mixAudio.some(
          (a) => !a.paused && a.currentTime > 0.2,
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const a = (window as unknown as { __mixAudio: HTMLAudioElement[] }).__mixAudio.find(
      (a) => !a.paused,
    )!;
    a.currentTime = 16.2;
    a.dispatchEvent(new Event('timeupdate'));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __mixAudio: HTMLAudioElement[] }).__mixAudio.filter(
            (a) => !a.paused,
          ).length,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(() =>
      Math.min(
        ...(window as unknown as { __mixAudio: HTMLAudioElement[] }).__mixAudio
          .filter((a) => !a.paused)
          .map((a) => a.currentTime),
      ),
    ),
  ).toBeGreaterThan(16);
});

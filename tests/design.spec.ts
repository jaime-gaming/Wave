import { settingsMenu } from './helpers/settings';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('wave-mix-v2') === null) localStorage.setItem('wave-mix-v2', 'false');
    if (localStorage.getItem('wave-autoplay') === null)
      localStorage.setItem('wave-autoplay', 'false');
  });
});

import { wav } from './helpers/audio';
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles(
    ['Alpha', 'Beta'].map((title) => ({
      name: title + '.wav',
      mimeType: 'audio/wav',
      buffer: wav(title, 120),
    })),
  );
  await expect(page.getByRole('status')).toContainText('2 tracks added');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('wave-library');
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction('tracks', 'readwrite'),
      store = tx.objectStore('tracks'),
      r = store.getAll();
    r.onsuccess = () => {
      for (const t of r.result) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const x = c.getContext('2d')!;
        x.fillStyle = t.title === 'Alpha' ? '#ba427c' : '#245cdd';
        x.fillRect(0, 0, 64, 64);
        store.put({ ...t, artwork: c.toDataURL() });
      }
    };
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    db.close();
  });
  await page.reload();
});
test('the playing cover tones the entire UI and privacy follows the selected light palette', async ({
  page,
}) => {
  const initial = await page
    .locator('.workspace')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.getByRole('button', { name: 'Play Alpha by Wave Tests' }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--wave-hue')))
    .toMatch(/^3\d\d$/);
  await expect
    .poll(() => page.locator('.workspace').evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(initial);
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await settingsMenu(page, 'Appearance');
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  const hue = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--wave-hue'),
  );
  await page.getByRole('link', { name: 'Privacy & rights', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Privacy & rights', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Queue, progress and appearance' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--hue'))).toBe(
    hue,
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
test('generated playlist artwork blends member colors and remains consistent across detail and Home', async ({
  page,
}) => {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await page.getByRole('button', { name: 'Create playlist', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Create playlist', exact: true });
  await editor.getByLabel('Playlist name').fill('Two colors');
  await editor.getByRole('button', { name: 'Create playlist', exact: true }).click();
  const empty = await page.locator('.playlist-detail .artwork img').getAttribute('src');
  expect(empty).toMatch(/^data:image\/svg\+xml/);
  await page.getByRole('button', { name: 'Add songs', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Add songs', exact: true });
  await picker.getByRole('checkbox', { name: 'Alpha Wave Tests', exact: true }).check();
  await picker.getByRole('checkbox', { name: 'Beta Wave Tests', exact: true }).check();
  await picker.getByRole('button', { name: 'Add 2 songs', exact: true }).click();
  await expect
    .poll(async () =>
      decodeURIComponent(
        (await page.locator('.playlist-detail .artwork img').getAttribute('src')) ?? '',
      ),
    )
    .toContain('rgb(186,66,124)');
  const mixed = await page.locator('.playlist-detail .artwork img').getAttribute('src');
  expect(decodeURIComponent(mixed!)).toContain('rgb(36,92,221)');
  expect(mixed).not.toBe(empty);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Home', exact: true })
    .click();
  await expect(page.locator('.home-playlist .artwork img')).toHaveAttribute('src', mixed!);
  await page.reload();
  await expect(page.locator('.home-playlist .artwork img')).toHaveAttribute('src', mixed!);
});
test('palette changes use the native bottom-circle reveal when motion is enabled', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await page.evaluate(() => {
    const start = document.startViewTransition.bind(document);
    Object.defineProperty(window, '__reveal', { value: [] });
    document.startViewTransition = (...args: Parameters<Document['startViewTransition']>) => {
      const transition = start(...args);
      void transition.ready
        .then(() => {
          const frames = document
            .getAnimations()
            .filter((a) => a instanceof CSSAnimation && a.animationName === 'palette-reveal')
            .flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().map((f) => f.clipPath));
          (window as unknown as { __reveal: unknown[] }).__reveal.push(...frames);
        })
        .catch(() => {});
      return transition;
    };
  });
  await page.getByRole('button', { name: 'Play Alpha by Wave Tests' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __reveal: string[] }).__reveal.join(' ')),
    )
    .toContain('circle(0');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __reveal: string[] }).__reveal.join(' ')),
    )
    .toContain('100%');
});
test('light accents retain readable white-label contrast across artwork hues', async ({ page }) => {
  const ratios = await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    const button = document.createElement('button');
    button.className = 'filled-button';
    button.textContent = 'Play';
    document.body.append(button);
    const luminance = (s: string) => {
      const c = s
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          const n = v / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        });
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    const ratios = [];
    for (const hue of [0, 60, 120, 180, 240, 300]) {
      document.documentElement.style.setProperty('--wave-hue', String(hue));
      const style = getComputedStyle(button),
        a = luminance(style.color),
        b = luminance(style.backgroundColor);
      ratios.push((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
    }
    button.remove();
    return ratios;
  });
  expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
});
test('the bottom dock offers working seek, volume, modes, favorite and track controls at phone width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Play Alpha by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  await full.getByRole('button', { name: 'Pause', exact: true }).click();
  const seek = full.getByRole('slider', { name: 'Seek', exact: true });
  await seek.press('Home');
  await seek.press('ArrowRight');
  await expect.poll(() => seek.inputValue()).not.toBe('0');
  const volume = full.getByRole('slider', { name: 'Volume', exact: true });
  await volume.press('Home');
  await expect(volume).toHaveValue('0');
  await volume.press('End');
  await expect(volume).toHaveValue('1');
  await full.getByRole('button', { name: 'Shuffle', exact: true }).click();
  await expect(full.getByRole('button', { name: 'Shuffle', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await full.getByRole('button', { name: 'Repeat: off', exact: true }).click();
  await expect(full.getByRole('button', { name: 'Repeat: all', exact: true })).toBeVisible();
  await full.getByRole('button', { name: 'Favorite current track', exact: true }).click();
  await expect(
    full.getByRole('button', { name: 'Unfavorite current track', exact: true }),
  ).toBeVisible();
  await full.getByRole('button', { name: 'Next track', exact: true }).click();
  await expect(full.locator('.stage-track h3')).toHaveText('Beta');
  await full.getByRole('button', { name: 'Previous track', exact: true }).click();
  await expect(full.locator('.stage-track h3')).toHaveText('Alpha');
  expect(
    await full
      .locator('.wave-seek__rest')
      .evaluate(
        (el) =>
          getComputedStyle(el).stroke !==
          getComputedStyle(el.closest('.stage-transport')!).backgroundColor,
      ),
  ).toBe(true);
});
test('album-first player puts credits below artwork and enlarges the song when lyrics collapse', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Play Alpha by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const player = page.getByRole('dialog', { name: 'Now playing', exact: true });
  const cover = player.locator('.stage-artwork');
  const credits = player.locator('.stage-track');
  const art = await cover.boundingBox();
  const text = await credits.boundingBox();
  expect(text!.y).toBeGreaterThanOrEqual(art!.y + art!.height);
  await page.setViewportSize({ width: 390, height: 844 });
  const before = await cover.boundingBox();
  expect(before!.width).toBeGreaterThan(140);
  expect(Math.abs(before!.width - before!.height)).toBeLessThan(2);
  await player.getByRole('button', { name: 'Lyrics', exact: true }).click();
  await expect(player.locator('.lyrics-panel')).toHaveCount(0);
  const after = await cover.boundingBox();
  expect(after!.width).toBeGreaterThan(220);
  expect(Math.abs(after!.width - after!.height)).toBeLessThan(2);
  await player.getByRole('button', { name: 'Lyrics', exact: true }).click();
  await expect(player.locator('.lyrics-panel')).toBeVisible();
});

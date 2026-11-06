import { test, expect } from '@playwright/test';
import { wav } from './helpers/audio';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wave-animations-enabled', 'false');
    localStorage.setItem('wave-editor-enabled', 'true');
    localStorage.setItem('wave-automatic-lyrics', 'false');
    const Native = window.Audio;
    const sources: HTMLAudioElement[] = [];
    Object.defineProperty(window, '__trimSources', { value: sources });
    window.Audio = class extends Native {
      constructor(src?: string) {
        super(src);
        sources.push(this);
      }
    };
  });
  await page.route('https://lrclib.net/**', (route) => route.abort());
  await page.goto('/Library');
  await expect(page.getByLabel('Import audio files')).toBeEnabled();
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 30) });
  await expect(page.getByRole('status')).toContainText('1 track added');
});

test('routes survive reload and browser back', async ({ page }) => {
  await page.getByRole('button', { name: 'Remix', exact: true }).click();
  await expect(page).toHaveURL(/\/Remix$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No week to look back on yet' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/Library$/);
  await expect(page.getByRole('button', { name: 'Play Signal by Wave Tests' })).toBeVisible();
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 800 },
  { width: 667, height: 375 },
]) {
  test(`trim edges and hold-zoom work at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Options for Signal' }).click();
    await page.getByRole('button', { name: 'Edit song', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit song', exact: true });
    await expect(editor.getByRole('slider')).toHaveCount(0);
    await editor.getByRole('button', { name: /Trim audio/ }).click();
    const trim = page.getByRole('dialog', { name: 'Trim audio', exact: true });
    await expect(trim.locator('audio[controls]')).toHaveCount(0);
    await expect(trim.locator('input[type=number]')).toHaveCount(0);
    await expect(trim.locator('svg line').first()).toBeAttached();
    const listen = trim.getByRole('button', { name: 'Listen to selection' });
    expect((await listen.boundingBox())!.height).toBeLessThan(70);
    expect((await listen.locator('svg').boundingBox())!.width).toBeLessThanOrEqual(20);
    const start = trim.getByRole('slider', { name: 'Trim start' });
    const box = await start.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect(trim.locator('.is-zoomed')).toBeVisible();
    await page.mouse.move(box!.x + 65, box!.y + box!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(trim.locator('.is-zoomed')).toHaveCount(0);
    expect(Number(await start.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    await trim.getByRole('button', { name: 'Save changes' }).click();
    await expect(trim).toHaveCount(0);
    const saved = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const req = indexedDB.open('wave-library');
        req.onsuccess = () => resolve(req.result);
      });
      const tracks = await new Promise<Array<{ trim?: { start: number } }>>((resolve) => {
        const req = db.transaction('tracks').objectStore('tracks').getAll();
        req.onsuccess = () => resolve(req.result);
      });
      db.close();
      return tracks[0].trim;
    });
    expect(saved?.start).toBeGreaterThan(0);
  });
}

for (const width of [360, 1280]) {
  test(`Remix highlights fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const req = indexedDB.open('wave-library');
        req.onsuccess = () => resolve(req.result);
      });
      const tx = db.transaction(['tracks', 'plays'], 'readwrite');
      const req = tx.objectStore('tracks').getAll();
      req.onsuccess = () =>
        tx.objectStore('plays').put({
          id: 'test-play',
          trackId: req.result[0].id,
          at: Date.now(),
          seconds: 4000,
          completed: true,
        });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    await page.goto('/Remix');
    await expect(page.getByRole('button', { name: /Listening time/ })).toContainText('1 h');
    await expect(page.getByRole('button', { name: /Top artist/ })).toContainText('Wave Tests');
    await page.getByRole('button', { name: /Top song/ }).click();
    await expect(page.locator('#remix-song-panel')).toContainText('Signal');
    const grid = await page.locator('.remix-highlights').boundingBox();
    const expanded = await page.locator('.remix-feature.is-expanded').boundingBox();
    expect(expanded!.width).toBeGreaterThanOrEqual(grid!.width - 2);
    expect(
      await page.getByRole('combobox', { name: 'Explore a week' }).locator('option').count(),
    ).toBe(1);
    if (width > 700) {
      const features = await page.locator('.remix-feature').evaluateAll((nodes) =>
        nodes.map((node) => ({
          top: node.getBoundingClientRect().top,
          bottom: node.getBoundingClientRect().bottom,
        })),
      );
      expect(features[0].bottom).toBeLessThanOrEqual(features[2].top);
      expect(features[1].bottom).toBeLessThanOrEqual(features[2].top);
      for (const [index, name] of ['Listening time', 'Top artist', 'Top song'].entries()) {
        await page.getByRole('button', { name: new RegExp(name) }).click();
        const cards = await page.locator('.remix-feature').evaluateAll((nodes) =>
          nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, width: rect.width };
          }),
        );
        expect(cards[index].width).toBeGreaterThanOrEqual(grid!.width - 2);
        for (let other = 0; other < cards.length; other++) {
          if (other < index) expect(cards[other].bottom).toBeLessThanOrEqual(cards[index].top);
          if (other > index) expect(cards[other].top).toBeGreaterThanOrEqual(cards[index].bottom);
        }
        if (index === 1) {
          const heads = await page.locator('.remix-highlight').evaluateAll((nodes) =>
            nodes.map((node) => ({
              imageRight: node.querySelector('.remix-feature-image')!.getBoundingClientRect().right,
              labelLeft: node.querySelector('.remix-highlight-label')!.getBoundingClientRect().left,
            })),
          );
          for (const head of heads) expect(head.imageRight).toBeLessThan(head.labelLeft);
        }
      }
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

test('Trim owns the audio while editing and releases its preview on close', async ({ page }) => {
  await page.getByRole('button', { name: 'Play Signal by Wave Tests' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __trimSources: HTMLAudioElement[] }).__trimSources.some(
          (audio) => !audio.paused,
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Options for Signal' }).click();
  await page.getByRole('button', { name: 'Edit song', exact: true }).click();
  await page.getByRole('button', { name: /Trim audio/ }).click();
  const trim = page.getByRole('dialog', { name: 'Trim audio', exact: true });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __trimSources: HTMLAudioElement[] }).__trimSources.every(
          (audio) => audio.paused,
        ),
      ),
    )
    .toBe(true);
  await trim.getByRole('button', { name: 'Listen to selection' }).click();
  await expect
    .poll(() => trim.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(false);
  const preview = await trim.locator('audio').elementHandle();
  await trim.getByRole('button', { name: 'Close dialog' }).click();
  await expect.poll(() => preview!.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true);
  expect(
    await page.evaluate(() =>
      (window as unknown as { __trimSources: HTMLAudioElement[] }).__trimSources.every(
        (audio) => audio.paused,
      ),
    ),
  ).toBe(true);
});

test('Fix volume in Settings balances the library and future imports, with a global bypass', async ({
  page,
}) => {
  await page.evaluate(() => {
    const gains: GainNode[] = [];
    Object.defineProperty(window, '__volumeGains', { value: gains });
    const create = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const node = create.call(this);
      gains.push(node);
      return node;
    };
  });
  await page.getByRole('button', { name: 'Play Signal by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Options for Signal' }).click();
  await page.getByRole('button', { name: 'Edit song', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit song', exact: true });
  await expect(editor.getByRole('button', { name: /Fix volume/ })).toHaveCount(0);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Playback', exact: true }).click();
  const volume = page.getByRole('region', { name: 'Volume balancing' });
  const toggle = volume.getByRole('switch', { name: 'Fix volume' });
  await expect(toggle).toHaveClass('material-switch');
  const fixBounds = await toggle.boundingBox();
  const mixBounds = await page.getByRole('switch', { name: 'Mix', exact: true }).boundingBox();
  expect(fixBounds!.width).toEqual(mixBounds!.width);
  expect(fixBounds!.height).toEqual(mixBounds!.height);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(volume.getByRole('status')).toContainText('1 of 1 recordings ready', {
    timeout: 15000,
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __volumeGains: GainNode[] }).__volumeGains.some(
          (node) => node.gain.value > 2,
        ),
      ),
    )
    .toBe(true);
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Future.wav', mimeType: 'audio/wav', buffer: wav('Future', 15) });
  await expect(volume.getByRole('status')).toContainText('2 of 2 recordings ready', {
    timeout: 15000,
  });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __volumeGains: GainNode[] }).__volumeGains.every(
          (node) => node.gain.value < 1.001,
        ),
      ),
    )
    .toBe(true);
  const state = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('wave-library');
      req.onsuccess = () => resolve(req.result);
    });
    const tracks = await new Promise<Array<{ volumeFix?: { gain: number } }>>((resolve) => {
      const req = db.transaction('tracks').objectStore('tracks').getAll();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return {
      gains: tracks.map((track) => track.volumeFix?.gain),
      enabled: localStorage.getItem('wave-fix-volume'),
    };
  });
  expect(state.gains.every((gain) => gain! > 2)).toBe(true);
  expect(state.enabled).toBe('false');
  await page.reload();
  await page.getByRole('button', { name: 'Playback', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Fix volume' })).not.toBeChecked();
});

test('repeat overlaps the same local song and renews only its repeat icon', async ({ page }) => {
  await page.getByRole('button', { name: 'Play Signal by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  const stage = page.getByRole('dialog', { name: 'Now playing', exact: true });
  await stage.getByRole('button', { name: 'Repeat: off' }).click();
  await stage.getByRole('button', { name: 'Repeat: all' }).click();
  const symbol = await stage.locator('.repeat-symbol').elementHandle();
  await page.evaluate(() => {
    const audio = (window as unknown as { __trimSources: HTMLAudioElement[] }).__trimSources.find(
      (source) => !source.paused,
    )!;
    audio.currentTime = 29.25;
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __trimSources: HTMLAudioElement[] }).__trimSources.filter(
              (source) => !source.paused,
            ).length,
        ),
      { intervals: [25, 50, 100] },
    )
    .toBe(2);
  await expect.poll(() => symbol!.evaluate((node) => node.isConnected)).toBe(false);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __trimSources: HTMLAudioElement[] }).__trimSources.filter(
            (source) => !source.paused,
          ).length,
      ),
    )
    .toBe(1);
  await expect(stage.locator('.mix-visual')).toHaveCount(0);
  await expect(stage.getByRole('button', { name: 'Repeat: one' })).toBeVisible();
});

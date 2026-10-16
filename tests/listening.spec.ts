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
  await page.addInitScript(() => {
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
  await page.getByLabel('Import audio files').setInputFiles(
    ['Alpha', 'Beta'].map((title) => ({
      name: `${title}.wav`,
      mimeType: 'audio/wav',
      buffer: wav(title, 120),
    })),
  );
  await expect(page.getByRole('status')).toContainText('2 tracks added');
});
async function jump(page: import('@playwright/test').Page, seconds: number) {
  await page.evaluate((seconds) => {
    const audio = (window as unknown as { __audio: HTMLAudioElement[] }).__audio.find(
      (a) => a.src && !a.paused,
    )!;
    audio.currentTime = seconds;
    audio.dispatchEvent(new Event('timeupdate'));
  }, seconds);
}
test('reload restores the selected song, queue and precise position in pause', async ({ page }) => {
  await page.getByRole('button', { name: 'Play Beta by Wave Tests' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await jump(page, 17.25);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.reload();
  const footer = page.getByRole('contentinfo', { name: 'Music player' });
  await expect(footer).toContainText('Beta');
  await expect(footer.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect
    .poll(async () => Number(await footer.getByRole('slider', { name: 'Seek' }).inputValue()))
    .toBeGreaterThan(17);
  expect(Number(await footer.getByRole('slider', { name: 'Seek' }).inputValue())).toBeLessThan(18);
  await footer.getByRole('button', { name: 'Show queue' }).click();
  await expect(page.getByLabel('Playback queue').locator('.queue-list li')).toHaveCount(2);
});
test('artist and album metadata navigate without restarting or switching audio', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Play Beta by Wave Tests' }).click();
  await jump(page, 19);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const row = page
    .locator('.song-row')
    .filter({ has: page.getByRole('button', { name: 'Play Alpha by Wave Tests' }) });
  await row.getByRole('button', { name: 'Open artist Wave Tests' }).click();
  await expect(page.getByRole('heading', { name: 'Wave Tests', exact: true })).toBeVisible();
  await expect(page.getByRole('contentinfo', { name: 'Music player' })).toContainText('Beta');
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Now playing' })
    .getByRole('button', { name: 'Open album First light' })
    .click();
  await expect(page.getByRole('heading', { name: 'First light', exact: true })).toBeVisible();
  expect(
    Number(await page.getByRole('slider', { name: 'Seek', exact: true }).inputValue()),
  ).toBeGreaterThan(18);
});
test('Now Playing fits without scrolling or clipping controls and follows authentic word times', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('wave-library');
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction('tracks', 'readwrite'),
      store = tx.objectStore('tracks'),
      r = store.getAll();
    r.onsuccess = () => {
      for (const track of r.result)
        store.put({
          ...track,
          lyrics: {
            raw: '[00:00]<00:00>Opening <00:02>line<00:04>\n[00:04]<00:04>The song <00:06>keeps <00:07>moving<00:08>\n[00:08]Back to the music',
            source: 'local',
            offsetMs: 0,
            lines: [],
          },
        });
    };
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Play Alpha by Wave Tests' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  // Seek the paused decoder so assertion latency cannot advance the tested word.
  await page.evaluate(() => {
    const audio = (window as unknown as { __audio: HTMLAudioElement[] }).__audio.find(
      (a) => a.src,
    )!;
    audio.currentTime = 5;
    audio.dispatchEvent(new Event('timeupdate'));
  });
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  const full = page.getByRole('dialog', { name: 'Now playing' });
  await expect(full.getByText('Word-timed · tap to seek')).toHaveCount(0);
  await expect(full.locator('.lyrics-provenance')).toContainText('Synchronized lyrics');
  const word = full.locator('.lyric-line[aria-current=true] .lyric-word').first();
  expect(Number(await word.getAttribute('data-word-fill'))).toBeGreaterThan(0.49);
  expect(Number(await word.getAttribute('data-word-fill'))).toBeLessThan(0.65);
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [768, 700],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        full.evaluate(
          (el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth,
        ),
      )
      .toBe(true);
    await expect.poll(() => full.evaluate(controlsFit)).toBe(true);
    await expect(full.locator('.lyric-line:not(.active)').first()).toHaveCSS(
      'filter',
      'blur(1.3px)',
    );
  }
});
test('idle listening enters a control-free stage after 30 seconds and activity restores the UI', async ({
  page,
}) => {
  await page.clock.install();
  await page.getByRole('button', { name: 'Play Alpha by Wave Tests' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __audio: HTMLAudioElement[] }).__audio.some(
          (a) => !a.paused && a.currentTime > 0.2,
        ),
      ),
    )
    .toBe(true);
  await page.clock.runFor(500);
  await page.clock.fastForward(30001);
  await expect(page.locator('.immersive-stage')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
  await expect(page.locator('.immersive-title')).toHaveText('Alpha');
  await expect(page.locator('.immersive-cover')).toBeVisible();
  await page.mouse.move(70, 70);
  await page.clock.runFor(600);
  await expect(page.locator('.immersive-stage')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
  await page.clock.fastForward(30001);
  await expect(page.locator('.immersive-stage')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.clock.runFor(600);
  await expect(page.locator('.immersive-stage')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Now playing' })).toBeVisible();
});
for (const kind of ['empty', 'plain', 'long'] as const)
  test(`${kind} lyrics and long metadata keep controls visible at every listening viewport`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(async (kind) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
          const r = indexedDB.open('wave-library');
          r.onsuccess = () => resolve(r.result);
        }),
        tx = db.transaction('tracks', 'readwrite'),
        store = tx.objectStore('tracks'),
        r = store.getAll();
      r.onsuccess = () => {
        const track = r.result.find((track) => track.title === 'Alpha');
        store.put({
          ...track,
          title:
            kind === 'long'
              ? 'A very long song title from an extended recording with more words than one line can hold'
              : `Viewport ${kind}`,
          artist:
            kind === 'long'
              ? 'An artist with a particularly long name and several collaborators'
              : 'Wave Tests',
          lyrics:
            kind === 'empty'
              ? undefined
              : {
                  raw:
                    kind === 'plain'
                      ? 'First plain line\nSecond plain line\nThird plain line'
                      : '[00:00]This long opening lyric wraps across several lines and remains legible inside the bounded player viewport\n[00:04]The second line also has many words to exercise the available space on a small mobile screen\n[00:08]The final line remains bounded while the controls stay available',
                  source: 'local',
                  offsetMs: 0,
                  lines: [],
                },
        });
      };
      await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
      db.close();
    }, kind);
    await page.reload();
    await page
      .getByRole('button', {
        name:
          kind === 'long'
            ? /^Play A very long song title from.+ by An artist/
            : /^Play Viewport .+ by Wave Tests$/,
      })
      .click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Open now playing', exact: true }).click();
    const full = page.getByRole('dialog', { name: 'Now playing' });
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [768, 700],
      [390, 844],
      [320, 568],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => full.evaluate(controlsFit)).toBe(true);
      if (kind !== 'empty')
        await expect
          .poll(() =>
            full.evaluate((el) =>
              [...el.querySelectorAll<HTMLElement>('.lyric-line')]
                .filter((b) => b.getClientRects().length)
                .every((b) => {
                  const text = b.querySelector<HTMLElement>('.lyric-text')!;
                  return (
                    b.clientHeight >= 24 &&
                    text.clientHeight >= 16 &&
                    text.getBoundingClientRect().bottom <= b.getBoundingClientRect().bottom + 1
                  );
                }),
            ),
          )
          .toBe(true);
    }
    if (kind === 'plain') {
      await full.getByText('Second plain line', { exact: true }).scrollIntoViewIfNeeded();
      await expect(full.getByText('Second plain line', { exact: true })).toBeVisible();
    }
  });

function controlsFit(el: HTMLElement) {
  return (
    el.scrollHeight <= el.clientHeight &&
    el.scrollWidth <= el.clientWidth &&
    [...el.querySelectorAll<HTMLElement>('button,input')]
      .filter((b) => b.getClientRects().length)
      .every((b) => {
        const r = b.getBoundingClientRect();
        if (b.matches('.lyric-line')) {
          const p = b.closest('.lyrics-scroll')!.getBoundingClientRect();
          if (r.top < p.top || r.bottom > p.bottom) return true;
        }
        if (r.top < 0 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1)
          return false;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && (b === hit || b.contains(hit));
      })
  );
}

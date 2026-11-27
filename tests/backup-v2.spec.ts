import { readFile } from 'node:fs/promises';
import { expect, test } from './helpers/returning-user';
import { wav } from './helpers/audio';

test('encrypted backup verifies the original device, rejects wrong passwords and restores original audio', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const audio = wav('Backup test', 4);
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Backup test.wav', mimeType: 'audio/wav', buffer: audio });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.goto('/Settings/Storage');
  const card = page.locator('.storage-backup');
  await expect(card.getByText('This device fingerprint')).toBeVisible();
  const fingerprint = await card.locator('.backup-fingerprint code').first().innerText();
  await card.getByLabel('Backup password').fill('a secure test password');
  await card.getByLabel('Confirm password').fill('a secure test password');
  const downloading = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Export library' }).click();
  const download = await downloading;
  const exported = await readFile((await download.path())!);
  expect(exported.subarray(0, 8).toString()).toBe('WAVEBK2\n');
  expect(exported.includes(Buffer.from('Backup test'))).toBe(false);

  const other = await browser.newContext();
  try {
    await other.addInitScript(() => localStorage.setItem('wave-welcome-done', 'true'));
    const target = await other.newPage();
    await target.goto('/Settings/Storage');
    const restore = target.locator('.storage-backup');
    await restore.getByLabel('Import library').setInputFiles({
      name: 'library.wavebackup',
      mimeType: 'application/octet-stream',
      buffer: exported,
    });
    await expect(target.getByRole('dialog', { name: 'Restore your library' })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await target.getByRole('dialog', { name: 'Restore your library' }).boundingBox())
            ?.width ?? 0,
      )
      .toBeGreaterThanOrEqual((target.viewportSize()?.width ?? 0) - 1);
    await restore.getByLabel('Backup password').fill('incorrect');
    await restore.getByRole('button', { name: 'Verify backup' }).click();
    await expect(target.getByRole('alert').filter({ hasText: 'Wrong password' })).toBeVisible();
    await restore.getByLabel('Backup password').fill('a secure test password');
    await restore.getByRole('button', { name: 'Verify backup' }).click();
    await expect(restore.getByText(fingerprint)).toBeVisible();
    await expect(restore.getByText(/Songs to restore: 1/)).toBeVisible();
    await expect(restore.getByRole('button', { name: 'Restore library' })).toBeDisabled();
    await restore.getByLabel('I compared the device fingerprint.').check();
    const reloaded = target.waitForEvent('load');
    await restore.getByRole('button', { name: 'Restore library' }).click();
    await reloaded;
    await expect
      .poll(
        async () =>
          target.evaluate(async () => {
            return new Promise<string>((resolve, reject) => {
              const request = indexedDB.open('wave-library');
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const db = request.result;
                const get = db.transaction('tracks').objectStore('tracks').getAll();
                get.onsuccess = () => {
                  resolve(get.result[0]?.title ?? '');
                  db.close();
                };
                get.onerror = () => reject(get.error);
              };
            });
          }),
        { timeout: 15_000 },
      )
      .toBe('Backup test');
    const restored = await target.evaluate(
      async () =>
        new Promise<number[]>((resolve, reject) => {
          const request = indexedDB.open('wave-library');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const get = db.transaction('tracks').objectStore('tracks').getAll();
            get.onsuccess = () => {
              void get.result[0].blob
                .arrayBuffer()
                .then((buffer: ArrayBuffer) => resolve(Array.from(new Uint8Array(buffer))));
              db.close();
            };
            get.onerror = () => reject(get.error);
          };
        }),
    );
    expect(Buffer.from(restored)).toEqual(audio);
  } finally {
    await other.close();
  }
});

test('legacy review stays usable on a narrow screen with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/Settings/Storage');
  const manifest = Buffer.from(
    JSON.stringify({
      version: 1,
      tracks: [],
      playlists: [],
      artists: [],
      albumOrders: [],
      plays: [],
    }),
  );
  const prefix = Buffer.alloc(12);
  prefix.write('WAVEBK1\n');
  prefix.writeUInt32LE(manifest.length, 8);
  const card = page.locator('.storage-backup');
  await card.getByLabel('Import library').setInputFiles({
    name: 'old.wavebackup',
    mimeType: 'application/octet-stream',
    buffer: Buffer.concat([prefix, manifest]),
  });
  await expect(page.getByRole('dialog', { name: 'Restore your library' })).toBeVisible();
  await expect(card.getByText(/This older backup has no encryption/)).toBeVisible();
  await expect(card.getByRole('button', { name: 'Restore library' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const review = card.locator('.backup-review');
  expect(await review.evaluate((node) => getComputedStyle(node).transform)).toBe('none');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Restore your library' })).toHaveCount(0);
});

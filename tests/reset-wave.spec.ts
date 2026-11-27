import { expect, test } from '@playwright/test';
import { wav } from './helpers/audio';

test('reset removes Wave data only after confirmation and returns to first run', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore Wave' }).click();
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 5) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.evaluate(() => {
    localStorage.setItem('wave-listener-name', 'Alex');
    localStorage.setItem('unrelated-site-data', 'keep');
  });
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'Storage', exact: true }).click();
  await page.getByRole('button', { name: 'Reset Wave' }).click();
  await expect(page.getByText(/This cannot be undone/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await page.evaluate(() => localStorage.getItem('wave-listener-name'))).toBe('Alex');
  await page.getByRole('button', { name: 'Reset Wave' }).click();
  await page.getByRole('button', { name: 'Erase Wave data' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to Wave' })).toBeVisible({
    timeout: 20_000,
  });
  expect(await page.evaluate(() => localStorage.getItem('wave-listener-name'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-site-data'))).toBe('keep');
  const count = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('wave-library');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('tracks').objectStore('tracks').count();
          request.onsuccess = () => {
            resolve(request.result);
            db.close();
          };
          request.onerror = () => {
            reject(request.error);
            db.close();
          };
        };
      }),
  );
  expect(count).toBe(0);
});

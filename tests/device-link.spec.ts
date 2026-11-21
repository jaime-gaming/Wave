import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { wav } from './helpers/audio';

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('wave-animations-enabled', 'false');
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copied: string }).copied = text;
        },
      },
    });
  });
}

async function copiedLink(page: Page) {
  await page.getByRole('button', { name: 'Copy link' }).click();
  return page.evaluate(() => (window as unknown as { copied: string }).copied);
}

test('two browsers pair with pasted links and transfer a verified local song', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext({ baseURL });
  const guestContext = await browser.newContext({ baseURL });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await prepare(host);
    await prepare(guest);
    await host.goto('/Library');
    const audio = wav('Signal', 4);
    await host
      .getByLabel('Import audio files')
      .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: audio });
    await expect(host.getByRole('status')).toContainText('1 track added');
    await host.goto('/Settings/Devices');
    await guest.goto('/Settings/Devices');
    await host.getByRole('button', { name: 'Show my code' }).click();
    await expect(host.getByAltText('Wave pairing code')).toBeVisible({ timeout: 20_000 });
    const invite = await copiedLink(host);
    await guest.getByLabel('Pairing code from the other device').fill(invite);
    await guest.getByRole('button', { name: 'Use it' }).click();
    await expect(guest.getByAltText('Wave pairing code')).toBeVisible({ timeout: 20_000 });
    const reply = await copiedLink(guest);
    await host.getByLabel('Pairing code from the other device').fill(reply);
    await host.getByRole('button', { name: 'Use it' }).click();
    const hostCode = host.getByLabel('Pairing code', { exact: true });
    const guestCode = guest.getByLabel('Pairing code', { exact: true });
    await expect(hostCode).toBeVisible({ timeout: 20_000 });
    await expect(guestCode).toBeVisible({ timeout: 20_000 });
    expect(await hostCode.textContent()).toBe(await guestCode.textContent());
    await host.getByRole('button', { name: 'They match' }).click();
    await guest.getByRole('button', { name: 'They match' }).click();
    await expect(host.getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Disconnect' })).toBeVisible();
    await guest.getByRole('checkbox', { name: /Signal/ }).check();
    await guest.getByRole('button', { name: 'Bring 1' }).click();
    await expect(guest.getByText('Signal', { exact: true }).last()).toBeVisible({
      timeout: 30_000,
    });
    const receivedHash = await expect
      .poll(
        async () =>
          guest.evaluate(async () => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open('wave-sync');
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            const audio = await new Promise<Array<{ bytes: ArrayBuffer; type: string }>>(
              (resolve, reject) => {
                const request = db.transaction('audio').objectStore('audio').getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              },
            );
            db.close();
            if (!audio.length) return '';
            const digest = await crypto.subtle.digest('SHA-256', audio[0].bytes);
            return (
              Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
                '',
              ) +
              ':' +
              audio[0].type
            );
          }),
        { timeout: 30_000 },
      )
      .toBe(`${createHash('sha256').update(audio).digest('hex')}:audio/wav`);
    void receivedHash;
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

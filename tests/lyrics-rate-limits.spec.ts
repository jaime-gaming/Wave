import { expect, test, type Page } from '@playwright/test';
import { wav } from './helpers/audio';

async function editor(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Options for Signal', exact: true }).click();
  await page.getByRole('button', { name: 'Edit lyrics', exact: true }).click();
  return page.getByRole('dialog', { name: 'Edit lyrics', exact: true });
}

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => {
    localStorage.setItem('wave-auto-lyrics', 'false');
    localStorage.setItem('wave-animations-enabled', 'false');
  });
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles({
    name: 'Signal.wav',
    mimeType: 'audio/wav',
    buffer: wav('Signal', 90),
  });
  await expect(page.getByRole('status')).toContainText('1 track added');
});

const found = {
  id: 70,
  trackName: 'Signal',
  artistName: 'Wave Tests',
  duration: 90,
  syncedLyrics: '[00:00]A verified verse\n[00:04]Another line',
};

test('two tabs share provider request spacing and never send a custom preflight header', async ({
  context,
  page,
}) => {
  const starts: number[] = [];
  await context.route('https://lrclib.net/api/**', async (route) => {
    expect(route.request().method()).toBe('GET');
    expect(route.request().headers()).not.toHaveProperty('lrclib-client');
    starts.push(Date.now());
    await route.fulfill({ json: found });
  });
  const other = await context.newPage();
  await other.goto('/');
  const [a, b] = await Promise.all([editor(page), editor(other)]);
  await Promise.all([
    a.getByRole('button', { name: 'Search online' }).click(),
    b.getByRole('button', { name: 'Search online' }).click(),
  ]);
  await expect(a.getByRole('button', { name: 'Use found lyrics' })).toBeVisible();
  await expect(b.getByRole('button', { name: 'Use found lyrics' })).toBeVisible();
  expect(starts).toHaveLength(2);
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(450);
});

test('a short Retry-After reenables search after two seconds, without a one-minute penalty', async ({
  page,
}) => {
  let requests = 0;
  await page.route('https://lrclib.net/api/**', (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({
          status: 429,
          headers: { 'Retry-After': '2', 'Access-Control-Expose-Headers': 'Retry-After' },
          body: 'Busy',
        })
      : route.fulfill({ json: found });
  });
  const dialog = await editor(page);
  const search = dialog.getByRole('button', { name: 'Search online' });
  await search.click();
  await expect(dialog.getByText(/Try again after/)).toBeVisible();
  await expect(search).toBeDisabled();
  expect(requests).toBe(1);
  await expect(search).toBeEnabled({ timeout: 4500 });
  await search.click();
  await expect(dialog.getByRole('button', { name: 'Use found lyrics' })).toBeVisible();
  expect(requests).toBe(2);
});

test('a throttle in one tab stops the already queued request in another tab', async ({
  context,
  page,
}) => {
  let requests = 0;
  await context.route('https://lrclib.net/api/**', async (route) => {
    requests++;
    await route.fulfill({ status: 503, headers: { 'Retry-After': '60' }, body: 'Busy' });
  });
  const other = await context.newPage();
  await other.goto('/');
  const [a, b] = await Promise.all([editor(page), editor(other)]);
  await Promise.all([
    a.getByRole('button', { name: 'Search online' }).click(),
    b.getByRole('button', { name: 'Search online' }).click(),
  ]);
  await expect(a.getByText(/Try again after/)).toBeVisible();
  await expect(b.getByText(/Try again after/)).toBeVisible();
  expect(requests).toBe(1);
});

test('an unexposed cross-origin Retry-After keeps a conservative fallback, not a rapid retry loop', async ({
  page,
}) => {
  let requests = 0;
  await page.route('https://lrclib.net/api/**', (route) => {
    requests++;
    return route.fulfill({ status: 429, headers: { 'Retry-After': '2' }, body: 'Busy' });
  });
  const dialog = await editor(page);
  await dialog.getByRole('button', { name: 'Search online' }).click();
  await expect(dialog.getByText(/Try again after/)).toBeVisible();
  expect(
    await page.evaluate(
      () => Number(localStorage.getItem('wave-lyrics-provider-retry-at')) - Date.now(),
    ),
  ).toBeGreaterThan(50_000);
  expect(requests).toBe(1);
});

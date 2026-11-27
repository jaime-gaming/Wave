import { expect, test } from '@playwright/test';
import { wav } from './helpers/audio';

for (const size of [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`setup fits ${size.width} by ${size.height} and previews lyrics choices`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Wave' })).toBeVisible();
    await page.getByRole('button', { name: 'Get started' }).click();
    for (const heading of [
      'What should we call you?',
      'Make it yours',
      'Your sound',
      'Find lyrics',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    await expect(page.getByRole('heading', { name: 'Follow every word' })).toBeVisible();
    await page.getByRole('switch', { name: 'Try more lyrics sources' }).click();
    await expect(page.locator('.welcome-preview-lyrics')).toHaveClass(/is-expanded/);
    const titleBox = await page.getByRole('heading', { name: 'Follow every word' }).boundingBox();
    expect(titleBox!.x).toBeGreaterThanOrEqual(0);
    expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(size.width + 1);
    expect(await page.locator('.welcome-setup').evaluate((element) => element.scrollLeft)).toBe(0);
    await expect(page.locator('.welcome-screen')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      size.width,
    );
    const dimensions = await page
      .locator('.welcome-screen')
      .evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  });
}

test('setup previews imported songs and promotes the finish action', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  for (let i = 0; i < 5; i++) {
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await page.getByRole('button', { name: 'Add my music' }).click();
  await page.getByLabel('Choose music files').setInputFiles({
    name: 'Signal.wav',
    mimeType: 'audio/wav',
    buffer: wav('Signal', 5),
  });
  await expect(page.getByRole('button', { name: 'Add more music' })).toHaveClass(/tonal-button/);
  await expect(page.getByRole('button', { name: 'Explore Wave' })).toHaveClass(/filled-button/);
  await expect(page.locator('.welcome-preview')).toContainText('Signal');
});

test('attached add menus open, close on scroll and give access to the original choices', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('wave-welcome-done', 'true'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const header = page.locator('.header-actions').getByRole('button', { name: 'Add music' });
  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: /From this device/ })).toBeVisible();
  await page.waitForTimeout(150);
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator('.header-actions .add-menu-panel');
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  const triggerBox = await header.boundingBox();
  expect(
    Math.abs(box!.y + box!.height / 2 - (triggerBox!.y + triggerBox!.height / 2)),
  ).toBeLessThan(2);
  expect(box!.height).toBeLessThanOrEqual(56);
  expect(box!.x).toBeLessThan(triggerBox!.x);
  expect(Math.abs(box!.x + box!.width - (triggerBox!.x + triggerBox!.width))).toBeLessThan(3);
  await page.evaluate(() => {
    document.body.style.minHeight = '3000px';
    window.scrollTo(0, 300);
  });
  await expect(page.locator('.header-actions .add-menu-trigger')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  const dock = page.locator('.section-scroll-dock__bar');
  await expect(dock.getByRole('button', { name: 'Add music' })).toBeVisible();
  await expect(dock.getByRole('button', { name: 'Open settings' })).toBeVisible();
  expect(
    (await dock.getByRole('button', { name: 'Add music' }).boundingBox())!.width,
  ).toBeGreaterThanOrEqual(42);
  await page.evaluate(() => window.scrollTo(0, 0));
  const collection = page.getByRole('region', { name: 'Your collection' });
  const add = collection.getByRole('button', { name: 'Add music' });
  await add.click();
  await expect(add).toHaveAttribute('aria-expanded', 'true');
  await expect(collection.getByRole('button', { name: /From this device/ })).toBeVisible();
  await page.waitForTimeout(200);
  const collectionPanel = await collection.locator('.add-menu-panel').boundingBox();
  const collectionTrigger = await add.boundingBox();
  expect(collectionPanel!.y).toBeLessThanOrEqual(collectionTrigger!.y + 2);
  expect(collectionPanel!.y + collectionPanel!.height).toBeGreaterThanOrEqual(
    collectionTrigger!.y + collectionTrigger!.height - 2,
  );
  expect(collectionPanel!.x).toBeGreaterThanOrEqual(0);
  expect(collectionPanel!.x + collectionPanel!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(add).toHaveAttribute('aria-expanded', 'false');
});

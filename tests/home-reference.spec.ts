import { expect, test } from '@playwright/test';
import { wav } from './helpers/audio';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wave-autoplay', 'false');
    localStorage.setItem('wave-android-prompt', 'dismissed');
  });
});

test('the reference desktop composition stays the same width when playback starts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByLabel('Import audio files').setInputFiles({
    name: 'Reference.wav',
    mimeType: 'audio/wav',
    buffer: wav('Reference', 8),
  });
  await expect(page.getByRole('status')).toContainText('1 track added');
  const workspace = page.locator('.workspace');
  const before = await workspace.boundingBox();
  expect(before).not.toBeNull();
  expect(before!.x).toBeCloseTo(220, 0);
  expect(before!.width).toBeCloseTo(852, 0);
  await expect(page.getByRole('region', { name: 'Jump back in' })).toHaveCount(0);
  const wordmark = page.locator('.wave-wordmark-full');
  await expect(wordmark).toBeVisible();
  expect(
    await wordmark.evaluate((node) => {
      const svg = node as unknown as SVGSVGElement;
      const box = svg.viewBox.baseVal;
      const halfStroke = Number(svg.getAttribute('stroke-width')) / 2;
      return [...svg.querySelectorAll('path')].every((path) => {
        const shape = path.getBBox();
        return (
          shape.x - halfStroke >= box.x &&
          shape.y - halfStroke >= box.y &&
          shape.x + shape.width + halfStroke <= box.x + box.width &&
          shape.y + shape.height + halfStroke <= box.y + box.height
        );
      });
    }),
  ).toBe(true);

  await page.getByRole('button', { name: 'Play Reference by Wave Tests' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  const after = await workspace.boundingBox();
  expect(after!.width).toBeCloseTo(before!.width, 0);
});

test('the phone keeps equal margins and all collection shortcuts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const workspace = page.locator('.workspace');
  const bounds = await workspace.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeCloseTo(10, 0);
  expect(bounds!.width).toBeCloseTo(370, 0);
  await expect(
    page.getByRole('region', { name: 'Your collection' }).locator('.home-shortcut'),
  ).toHaveCount(5);
  await expect(page.getByRole('region', { name: 'Jump back in' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

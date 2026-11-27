import { expect, test } from './helpers/returning-user';

for (const width of [320, 390, 1440]) {
  test(`navigation and attached add menu fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/', '/Library', '/Remix', '/Settings']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width + 1,
      );
    }
    await page.goto('/');
    const add = page.locator('.header-actions').getByRole('button', { name: 'Add music' });
    await add.click();
    await page.waitForTimeout(350);
    const box = (await page.locator('.header-actions .add-menu-panel').boundingBox())!;
    const trigger = (await add.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(Math.abs(box.y + box.height / 2 - trigger.y - trigger.height / 2)).toBeLessThan(2);
    expect(box.height).toBeLessThan(56);
    expect(box.x).toBeLessThanOrEqual(trigger.x + 1);
    expect(box.x + box.width).toBeGreaterThanOrEqual(trigger.x + trigger.width - 1);
    expect(box.y).toBeLessThanOrEqual(trigger.y + 1);
    expect(box.y + box.height).toBeGreaterThanOrEqual(trigger.y + trigger.height - 1);
    for (const label of ['Files', 'Folder', 'YouTube']) {
      await expect(
        page.locator('.header-actions .add-menu-panel strong', { hasText: label }),
      ).toBeVisible();
    }
    await add.click();
    const collection = page.locator('.home-overview .add-menu-trigger');
    await collection.click();
    await page.waitForTimeout(350);
    const collectionPanel = (await page.locator('.home-overview .add-menu-panel').boundingBox())!;
    const collectionButton = (await collection.boundingBox())!;
    expect(collectionPanel.x).toBeGreaterThanOrEqual(0);
    expect(collectionPanel.x + collectionPanel.width).toBeLessThanOrEqual(width);
    expect(Math.abs(collectionPanel.width - collectionButton.width)).toBeLessThan(2);
    expect(collectionPanel.y).toBeLessThanOrEqual(collectionButton.y + 1);
    expect(collectionPanel.y + collectionPanel.height).toBeGreaterThanOrEqual(
      collectionButton.y + collectionButton.height,
    );
    expect(collectionPanel.y + collectionPanel.height).toBeGreaterThan(
      collectionButton.y + collectionButton.height + 80,
    );
    for (const label of ['Files', 'Folder', 'YouTube']) {
      await expect(
        page.locator('.home-overview .add-menu-panel strong', { hasText: label }),
      ).toBeVisible();
    }
  });
}

test('settings gear visibly tightens when pressed and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const button = page.locator('.header-actions').getByRole('button', { name: 'Open settings' });
  await button.hover();
  await page.mouse.down();
  expect(
    await button
      .locator('.glyph-gear')
      .evaluate((gear) => gear.getAnimations().some((item) => item.id === 'gear-tighten')),
  ).toBe(true);
  await page.waitForTimeout(450);
  const stopped = await button
    .locator('.glyph-gear')
    .evaluate((gear) => getComputedStyle(gear).transform);
  expect(stopped === 'none' || stopped === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
  await page.waitForTimeout(250);
  expect(
    await button.locator('.glyph-gear').evaluate((gear) => getComputedStyle(gear).transform),
  ).toBe(stopped);
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const reduced = page.locator('.header-actions').getByRole('button', { name: 'Open settings' });
  await reduced.hover();
  await page.mouse.down();
  expect(
    await reduced
      .locator('.glyph-gear')
      .evaluate((gear) => gear.getAnimations().some((item) => item.id === 'gear-tighten')),
  ).toBe(false);
  await page.mouse.up();
});

test('Spanish labels and a personal greeting fit on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() => {
    localStorage.setItem('wave-language', 'es');
    localStorage.setItem('wave-listener-name', 'Jaime');
  });
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText(/Jaime$/);
  await expect(page.locator('.library-summary')).toContainText('canciones');
  await page.locator('.home-overview .add-menu-trigger').click();
  await page.waitForTimeout(250);
  const panel = page.locator('.home-overview .add-menu-panel');
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  for (const label of ['Archivos', 'Carpeta', 'YouTube']) {
    const text = panel.locator('strong', { hasText: label });
    await expect(text).toBeVisible();
    expect(await text.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});

test('both add menus surround their buttons and launch their actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const area of ['.header-actions', '.home-overview']) {
    const root = page.locator(area);
    const add = root.locator('.add-menu-trigger');
    await add.click();
    await expect(add).toHaveAttribute('aria-expanded', 'true');
    const chooser = page.waitForEvent('filechooser');
    await root.getByRole('button', { name: 'From this device' }).click();
    await chooser;
    await expect(add).toHaveAttribute('aria-expanded', 'false');
    await add.click();
    await root.getByRole('button', { name: 'Add from YouTube' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test('settings gear responds to hover and resets, without motion when reduced', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const button = page.locator('.header-actions').getByRole('button', { name: 'Open settings' });
  const gear = button.locator('.glyph-gear');
  await button.hover();
  await expect
    .poll(() => gear.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).b))
    .toBeLessThan(-0.2);
  await page.mouse.move(1, 1);
  await expect
    .poll(() =>
      gear.evaluate((node) => Math.abs(new DOMMatrixReadOnly(getComputedStyle(node).transform).b)),
    )
    .toBeLessThan(0.02);
  await button.hover();
  await expect
    .poll(() => gear.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).b))
    .toBeLessThan(-0.2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      gear.evaluate((node) => Math.abs(new DOMMatrixReadOnly(getComputedStyle(node).transform).b)),
    )
    .toBeLessThan(0.02);
});

test('Mix explanation is displayed below its label in Spanish on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => localStorage.setItem('wave-language', 'es'));
  await page.goto('/Settings/Playback');
  const label = page.getByText('Mix', { exact: true }).last();
  const subtitle = page.getByText(
    'Mix enlaza suavemente las canciones locales. Las canciones de YouTube se reproducen normalmente, sin Mix.',
  );
  await expect(subtitle).toBeVisible();
  const titleBox = await label.boundingBox();
  const subtitleBox = await subtitle.boundingBox();
  expect(subtitleBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
  expect(subtitleBox!.x + subtitleBox!.width).toBeLessThanOrEqual(320);
});

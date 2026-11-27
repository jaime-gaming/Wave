import { test, expect } from './helpers/returning-user';

for (const width of [390, 1280]) {
  test(`privacy sections expand accessibly without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/privacy.html');
    const section = page.locator('details').filter({ hasText: 'Song details and artist photos' });
    await expect(section).not.toHaveAttribute('open', '');
    await section.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(section).toHaveAttribute('open', '');
    await expect(
      section.locator('p').filter({ hasText: 'Automatic completion may also use Deezer' }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await section.locator('summary').click();
    await expect(section).not.toHaveAttribute('open', '');
  });
}

test('an incoming pairing link needs confirmation before connecting', async ({ page }) => {
  await page.goto('/Settings/Devices#wave-pair=wave1.invalid');
  const incoming = page.getByRole('region', { name: 'Incoming device link' });
  await expect(incoming).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show my code' })).toBeHidden();
  await incoming.getByRole('button', { name: 'Cancel' }).click();
  await expect(incoming).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show my code' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
});

test('extended library searches require separate opt-in', async ({ page }) => {
  await page.goto('/Settings/Library');
  await page.getByText('Advanced options', { exact: true }).click();
  const comparison = page.getByRole('switch', { name: 'Compare more catalogues' });
  await expect(comparison).not.toBeChecked();
  const roles = page.getByRole('switch', { name: 'Verify artist and title across the library' });
  const clips = page.getByRole('switch', { name: 'Find clips across the library' });
  await expect(roles).not.toBeChecked();
  await expect(clips).not.toBeChecked();
  await comparison.click();
  await expect(comparison).toBeChecked();
  await roles.click();
  await expect(roles).toBeChecked();
  await expect(clips).not.toBeChecked();
  await page.reload();
  await page.getByText('Advanced options', { exact: true }).click();
  await expect(roles).toBeChecked();
  await expect(comparison).toBeChecked();
  await expect(clips).not.toBeChecked();
});

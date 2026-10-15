import type { Page } from '@playwright/test';
export async function settingsMenu(page: Page, name: string) {
  const back = page.getByRole('button', { name: 'Back to settings', exact: true });
  if (await back.isVisible()) await back.click();
  await page
    .getByRole('region', { name: 'Settings', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
}
export async function closeSettings(page: Page) {
  const back = page.getByRole('button', { name: 'Back to settings', exact: true });
  if (await back.isVisible()) await back.click();
  await page.getByRole('button', { name: 'Back from settings', exact: true }).click();
}

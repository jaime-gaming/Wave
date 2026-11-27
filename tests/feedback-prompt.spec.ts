import { expect, test } from './helpers/returning-user';
import { wav } from './helpers/audio';

for (const [path, feature] of [
  ['/', 'Home'],
  ['/Search', 'Search'],
  ['/Library', 'Library'],
  ['/Remix', 'Remix'],
  ['/Settings', 'Settings'],
]) {
  test(`the opinion prompt works on ${feature}`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'wave-local-feature-feedback-v1',
        JSON.stringify({ firstSeen: Date.now() - 10 * 86400000, nextAt: 0, uses: 12, ratings: [] }),
      );
      Math.random = () => 0;
    });
    await page.goto(path);
    const card = page.locator('.local-feedback');
    await expect(card).toContainText(`What do you think of ${feature}?`);
    await expect(
      card.getByRole('link', { name: 'Share positive feedback on GitHub' }),
    ).toHaveAttribute('target', '_blank');
    await expect(card.getByRole('link', { name: 'Share feedback on GitHub' })).toBeVisible();
    await card.getByRole('button', { name: 'Close' }).click();
    await expect(card).toHaveCount(0);
  });
}

test('a question can appear in the full player above its content', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto('/');
  await page
    .getByLabel('Import audio files')
    .setInputFiles({ name: 'Signal.wav', mimeType: 'audio/wav', buffer: wav('Signal', 30) });
  await expect(page.getByRole('status')).toContainText('1 track added');
  await page.getByRole('button', { name: 'Play Signal by Wave Tests', exact: true }).click();
  await page.evaluate(() =>
    localStorage.setItem(
      'wave-local-feature-feedback-v1',
      JSON.stringify({ firstSeen: Date.now() - 10 * 86400000, nextAt: 0, uses: 12, ratings: [] }),
    ),
  );
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const dialog = page.getByRole('dialog', { name: 'Now playing' });
  await expect(dialog.locator('.local-feedback')).toContainText(
    'What do you think of Now playing?',
  );
  await expect(dialog.locator('.local-feedback')).toBeVisible();
});

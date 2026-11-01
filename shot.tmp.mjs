import chromiumPackage from '@sparticuz/chromium';
import { chromium } from 'playwright';

const executablePath = await chromiumPackage.executablePath();
const browser = await chromium.launch({
  executablePath,
  args: [...chromiumPackage.args, '--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
  headless: true,
});
const url = process.env.URL ?? 'http://127.0.0.1:5173/';
const out = process.env.OUT ?? '/tmp/shots';
const sizes = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 200)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${size.name}-home.png` });
  // Settings
  const settings = page.getByRole('button', { name: 'Settings' }).first();
  if (await settings.count()) {
    await settings.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${size.name}-settings.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  await page.close();
}
await browser.close();
console.log('shots done');

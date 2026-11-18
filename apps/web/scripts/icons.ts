/**
 * Renders public/icon.svg to the PNG sizes the web app manifest and iOS need. Run after changing
 * the icon: `npm run icons -w @app/web`. Uses the installed Google Chrome, like the screenshots.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const pub = resolve(import.meta.dirname, '../public');
const svg = readFileSync(resolve(pub, 'icon.svg'), 'utf8');
const SIZES = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
for (const [file, size] of Object.entries(SIZES)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: resolve(pub, file) });
  console.log(file);
}
await browser.close();

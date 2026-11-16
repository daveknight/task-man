/**
 * Screenshots of the design screens in light and dark, on desktop and an iPhone-sized viewport.
 * Needs the dev server (`npm run web`). Usage:
 *   npm run screenshots -w @app/web -- --out ../../screenshots [--base http://127.0.0.1:5179] [--only board,sheet]
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, devices, type BrowserContextOptions, type Page } from 'playwright';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'screenshots' },
    base: { type: 'string', default: 'http://127.0.0.1:5179' },
    only: { type: 'string' },
  },
});

type Device = 'desktop' | 'iphone';
const { defaultBrowserType: _, ...iphone } = devices['iPhone 15 Pro']!;
const DEVICES: Record<Device, BrowserContextOptions> = {
  desktop: { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 },
  iphone,
};

interface Shot {
  screen: string;
  devices?: Device[];
  fullPage?: boolean;
  /** For screens that show both themes themselves: one capture, named without the scheme. */
  bothThemes?: boolean;
  act?: (page: Page, device: Device) => Promise<void>;
}

const row = (page: Page, title: string) => page.locator('[data-slot=task-row]', { hasText: title }).first();

const SHOTS: Shot[] = [
  { screen: 'board', fullPage: true },
  { screen: 'board-expanded', fullPage: true },
  { screen: 'menu' },
  {
    screen: 'hover',
    devices: ['desktop'],
    act: async (page) => {
      await row(page, 'Return library books').hover();
    },
  },
  {
    screen: 'context-menu',
    devices: ['desktop'],
    act: async (page) => {
      await row(page, 'Renew passport').click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Due' }).hover();
      await page.getByRole('menuitem', { name: /^\+1 day/ }).waitFor();
    },
  },
  { screen: 'actions', fullPage: true },
  { screen: 'sheet' },
  { screen: 'sheet-waiting' },
  { screen: 'resume-icons', devices: ['desktop'], fullPage: true, bothThemes: true },
];

const out = resolve(values.out!);
mkdirSync(out, { recursive: true });
const only = values.only?.split(',');
// Installed Google Chrome, so no Playwright browser download is needed; CHROME_PATH overrides it.
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const written: string[] = [];

for (const shot of SHOTS.filter((s) => !only || only.includes(s.screen))) {
  for (const device of shot.devices ?? (['desktop', 'iphone'] as Device[])) {
    for (const colorScheme of shot.bothThemes ? (['light'] as const) : (['light', 'dark'] as const)) {
      const context = await browser.newContext({ ...DEVICES[device], colorScheme });
      const page = await context.newPage();
      await page.goto(`${values.base}/design/${shot.screen}`);
      await page.locator('main').first().waitFor();
      await page.waitForTimeout(300);
      await shot.act?.(page, device);
      await page.waitForTimeout(500);
      const file = resolve(out, `${shot.screen}-${device}${shot.bothThemes ? '' : `-${colorScheme}`}.png`);
      await page.screenshot({ path: file, fullPage: shot.fullPage ?? false });
      written.push(file);
      await context.close();
    }
  }
}

await browser.close();
console.log(written.join('\n'));

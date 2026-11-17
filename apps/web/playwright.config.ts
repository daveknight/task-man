import { defineConfig, devices } from '@playwright/test';

const { defaultBrowserType: _, ...iphone } = devices['iPhone 15 Pro']!;

/**
 * Behavior tests against the dev server and local Supabase, with the seed at a pinned day.
 * Every test reseeds, so they run one at a time.
 */
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5179',
    // Installed Google Chrome, so no Playwright browser download is needed.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-light', use: { viewport: { width: 1280, height: 860 }, colorScheme: 'light' }, testIgnore: /phone\.spec\.ts/ },
    { name: 'desktop-dark', use: { viewport: { width: 1280, height: 860 }, colorScheme: 'dark' }, testIgnore: /phone\.spec\.ts/ },
    { name: 'phone', use: { ...iphone, colorScheme: 'light' }, testMatch: /phone\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5179',
    reuseExistingServer: true,
  },
});

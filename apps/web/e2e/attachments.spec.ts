import { expect, test, type Page } from '@playwright/test';
import { openBoard, reseed, row } from './helpers';

const TASK = 'Buy new watch band';

/** A 1×1 PNG, small enough that it is stored as itself. */
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

const editor = (page: Page) => page.locator('[data-slot=task-editor]');

async function openTask(page: Page, title = TASK) {
  await row(page, title).getByText(title).click();
  await expect(editor(page)).toBeVisible();
}

test('files are added on the task sheet and never marked on the row', async ({ page }) => {
  await openTask(page);
  const files = editor(page).locator('[data-slot=files]');
  await expect(files.getByRole('button', { name: 'Add file' })).toHaveCount(1);
  await expect(files.getByRole('button', { name: 'Add photo' })).toHaveCount(0);
  await expect(files.locator('[data-slot=file-input]')).toHaveCount(1);
  await expect(files.getByText('Files')).toBeVisible();

  await files.locator('[data-slot=file-input]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('remember the milk') });
  const fileRow = files.locator('[data-slot=file-row]');
  await expect(fileRow).toContainText('notes.txt');
  await expect(fileRow.locator('[data-slot=file-thumb]')).toHaveCount(0);
  await expect(row(page, TASK).locator('[data-slot=file-row]')).toHaveCount(0);
  await expect(row(page, TASK).locator('img')).toHaveCount(0);
  await expect(row(page, TASK)).not.toContainText('notes.txt');

  // The board menu sits outside the pane, so opening it clears the selection.
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  const settings = page.locator('[data-slot=settings]');
  await expect(settings.getByText(/of 1 GB/)).toBeVisible();
  await expect(settings.getByText('0 B of 1 GB')).toHaveCount(0);
  await settings.getByRole('button', { name: 'Done' }).click();

  await openTask(page);
  const again = editor(page).locator('[data-slot=file-row]');
  await again.hover();
  await again.getByRole('button', { name: 'Remove notes.txt' }).click();
  await expect(editor(page).locator('[data-slot=file-row]')).toHaveCount(0);
});

test('a photo is shown as a thumbnail and a wide one is downscaled', async ({ page }) => {
  await openTask(page);
  const files = editor(page).locator('[data-slot=files]');
  await files.locator('[data-slot=file-input]').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: TINY_PNG });
  const thumb = files.locator('[data-slot=file-thumb]');
  await expect(thumb).toBeVisible();
  await expect(files.locator('[data-slot=file-row]')).toContainText('dot.png');

  const wide = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 3200;
      canvas.height = 1800;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      ctx.fillStyle = '#2266cc';
      ctx.fillRect(0, 0, 3200, 1800);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(80, 80, 600, 400);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no blob'))), 'image/jpeg', 0.92));
      return [...new Uint8Array(await blob.arrayBuffer())];
    }),
  );
  await files.locator('[data-slot=file-input]').setInputFiles({ name: 'wide.jpg', mimeType: 'image/jpeg', buffer: wide });
  const thumbs = files.locator('[data-slot=file-thumb]');
  await expect(thumbs).toHaveCount(2);
  await expect.poll(async () => thumbs.nth(1).evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0))).toBe(2048);
});

test('capture has no file picker, and trash keeps files read-only', async ({ page }) => {
  await page.getByRole('button', { name: 'Capture', exact: true }).click();
  const capture = page.getByRole('dialog', { name: 'Capture' });
  await expect(capture).toBeVisible();
  await expect(capture.locator('input[type=file]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Show deleted' }).click();
  await row(page, 'Duplicate: buy watch band').click();
  const files = editor(page).locator('[data-slot=files]');
  await expect(files.getByText('Files')).toBeVisible();
  await expect(files.getByRole('button', { name: 'Add photo' })).toHaveCount(0);
  await expect(files.getByRole('button', { name: 'Add file' })).toHaveCount(0);
  await expect(files.locator('input[type=file]')).toHaveCount(0);
});

test('the files card uses the theme behind it', async ({ page }) => {
  await openTask(page);
  const card = editor(page).locator('[data-slot=files] .bg-card').first();
  await expect(card).toBeVisible();
  const { dark, background } = await card.evaluate((el) => ({
    dark: document.documentElement.classList.contains('dark'),
    background: getComputedStyle(el).backgroundColor,
  }));
  const channels = background.match(/\d+/g)?.map(Number) ?? [];
  expect(channels.length).toBeGreaterThanOrEqual(3);
  const sum = channels[0]! + channels[1]! + channels[2]!;
  if (dark) expect(sum).toBeLessThan(180 * 3);
  else expect(sum).toBeGreaterThan(180 * 3);
});

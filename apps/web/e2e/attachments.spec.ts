import { expect, test, type Page } from '@playwright/test';
import { openBoard, reseed, row, showTask, TODAY } from './helpers';

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
  await page.getByRole('menuitem', { name: 'View recently deleted' }).click();
  await row(page, 'Duplicate: buy watch band').click();
  const files = editor(page).locator('[data-slot=files]');
  await expect(files.getByText('Files')).toBeVisible();
  await expect(files.getByRole('button', { name: 'Add photo' })).toHaveCount(0);
  await expect(files.getByRole('button', { name: 'Add file' })).toHaveCount(0);
  await expect(files.locator('input[type=file]')).toHaveCount(0);
});

test('a photo opens in a preview and another file opens directly', async ({ page }) => {
  await openTask(page);
  const files = editor(page).locator('[data-slot=files]');
  await files.locator('[data-slot=file-input]').setInputFiles([
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('remember the milk') },
    { name: 'dot.png', mimeType: 'image/png', buffer: TINY_PNG },
  ]);
  const notes = files.locator('[data-slot=file-row]').filter({ hasText: 'notes.txt' });
  const photo = files.locator('[data-slot=file-row]').filter({ hasText: 'dot.png' });
  await expect(notes.getByRole('link', { name: 'notes.txt', exact: true })).toHaveAttribute('target', '_blank');
  await expect(photo.getByRole('link', { name: 'dot.png', exact: true })).toHaveCount(0);

  await photo.getByRole('button', { name: 'dot.png', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'dot.png' });
  await expect(preview).toBeVisible();
  const box = await preview.boundingBox();
  expect(box!.width).toBeGreaterThan(1000);
  expect(box!.height).toBeGreaterThan(700);
  const image = preview.locator('[data-slot=image-stage] img');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('data-zoom', '1');

  const { dark, background } = await preview.evaluate((el) => ({
    dark: document.documentElement.classList.contains('dark'),
    background: getComputedStyle(el).backgroundColor,
  }));
  const channels = background.match(/\d+/g)?.map(Number) ?? [];
  expect(channels.length).toBeGreaterThanOrEqual(3);
  const sum = channels[0]! + channels[1]! + channels[2]!;
  if (dark) expect(sum).toBeLessThan(180 * 3);
  else expect(sum).toBeGreaterThan(180 * 3);

  const zoomIn = preview.getByRole('button', { name: 'Zoom in' });
  const zoomOut = preview.getByRole('button', { name: 'Zoom out' });
  await expect(zoomIn).toBeVisible();
  await expect(zoomOut).toBeDisabled();
  await zoomIn.click();
  await expect(image).toHaveAttribute('data-zoom', '1.5');
  await expect(zoomOut).toBeEnabled();
  await zoomOut.click();
  await expect(image).toHaveAttribute('data-zoom', '1');

  const original = preview.getByRole('link', { name: 'Open original' });
  await expect(original).toHaveAttribute('target', '_blank');
  await expect(original).toHaveAttribute('rel', /noreferrer/);
  await expect(original).toHaveAttribute('href', (await photo.locator('[data-slot=file-thumb]').getAttribute('src')) ?? '');

  await preview.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(preview).toBeHidden();
  await expect(editor(page)).toBeVisible();

  await photo.getByRole('button', { name: 'dot.png', exact: true }).click();
  await expect(preview).toBeVisible();
  await expect(image).toHaveAttribute('data-zoom', '1');
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  await expect(editor(page)).toBeVisible();
});

test('the address keeps the task and a preview, and back closes the preview first', async ({ page }) => {
  const taskId = showTask(TASK).task.id;
  await openTask(page);
  await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}\\?today=${TODAY}$`));

  await page.reload();
  await expect(editor(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}\\?today=${TODAY}$`));

  await row(page, 'Water the plants').getByText('Water the plants').click();
  const otherId = showTask('Water the plants').task.id;
  await expect(editor(page).getByRole('textbox', { name: 'Title' })).toHaveValue('Water the plants');
  await expect(page).toHaveURL(new RegExp(`/tasks/${otherId}\\?today=${TODAY}$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`\\/\\?today=${TODAY}$`));
  await expect(editor(page)).toBeHidden();
  await page.goForward();
  await expect(editor(page).getByRole('textbox', { name: 'Title' })).toHaveValue('Water the plants');

  await editor(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`\\/\\?today=${TODAY}$`));
  await page.goForward();
  await expect(editor(page)).toBeVisible();

  const files = editor(page).locator('[data-slot=files]');
  await files.locator('[data-slot=file-input]').setInputFiles([
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('remember the milk') },
    { name: 'dot.png', mimeType: 'image/png', buffer: TINY_PNG },
  ]);
  const notes = files.locator('[data-slot=file-row]').filter({ hasText: 'notes.txt' });
  const before = await page.evaluate(() => ({ url: location.href, length: history.length }));
  const popupPromise = page.waitForEvent('popup');
  await notes.getByRole('link', { name: 'notes.txt', exact: true }).click();
  const popup = await popupPromise;
  await expect.poll(() => page.evaluate(() => ({ url: location.href, length: history.length }))).toEqual(before);
  await popup.close();

  await files.locator('[data-slot=file-row]').filter({ hasText: 'dot.png' }).getByRole('button', { name: 'dot.png', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'dot.png' });
  await expect(preview).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/tasks/${otherId}/files/[^/?]+\\?today=${TODAY}$`));
  const previewUrl = page.url();

  await page.reload();
  await expect(page.getByRole('dialog', { name: 'dot.png' })).toBeVisible();
  await expect(editor(page)).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'dot.png' })).toBeHidden();
  await expect(editor(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/tasks/${otherId}\\?today=${TODAY}$`));
  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'dot.png' })).toBeVisible();

  await page.getByRole('dialog', { name: 'dot.png' }).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'dot.png' })).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/tasks/${otherId}\\?today=${TODAY}$`));
  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'dot.png' })).toBeVisible();
  await page.goBack();
  await page.goBack();
  await expect(editor(page)).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`\\/\\?today=${TODAY}$`));

  await page.goto(previewUrl);
  await expect(page.getByRole('dialog', { name: 'dot.png' })).toBeVisible();
  await page.goBack();
  await expect(editor(page)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'dot.png' })).toBeHidden();
  await page.goBack();
  await expect(editor(page)).toBeHidden();
  await page.goForward();
  await expect(editor(page)).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'dot.png' })).toBeVisible();
});

test('at overlay width the sheet is on the address, and back closes it', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  const taskId = showTask(TASK).task.id;
  await openTask(page);
  const sheet = page.locator('[data-slot=sheet-content]');
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}\\?today=${TODAY}$`));
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`\\/\\?today=${TODAY}$`));
  await page.goForward();
  await expect(sheet).toBeVisible();
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

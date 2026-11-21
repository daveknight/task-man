import { expect, test } from '@playwright/test';
import { findTask, openBoard, reseed, row, showTask, titlesIn } from './helpers';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

test('tapping a row opens the bottom sheet', async ({ page }) => {
  await row(page, 'Buy new watch band').getByText('Buy new watch band').tap();
  await expect(page.locator('[data-slot=drawer-content] [data-slot=task-editor]')).toBeVisible();
});

test('the floating Add task button quick-adds from anywhere on the board', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Add task' })).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole('button', { name: 'Add task' }).tap();
  await page.getByRole('textbox', { name: 'New task' }).fill('Book flu shots for the family');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await titlesIn(page, 'ready'))[0]).toBe('Book flu shots for the family');
  await expect.poll(() => findTask('Book flu shots for the family')?.placement).toBe('ready');
});

test('scrolled to the bottom, the floating button leaves the last row tappable', async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const upcoming = page.locator('[data-section=upcoming]').getByRole('button', { name: /Upcoming/ });
  const box = (await upcoming.boundingBox())!;
  // A raw tap at the row's right end, where the button floats. Locator taps would scroll the row clear first.
  await page.touchscreen.tap(box.x + box.width - 8, box.y + box.height / 2);
  await expect(page.locator('[data-section=upcoming] [data-slot=task-row]').first()).toBeVisible();
});

test('swipe left shows the row buttons; Due opens the quick picks', async ({ page }) => {
  const target = row(page, 'Return library books');
  const box = (await target.boundingBox())!;
  const y = box.y + box.height / 2;
  const pointer = (type: 'pointerdown' | 'pointermove' | 'pointerup', x: number) =>
    target.dispatchEvent(type, { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: x, clientY: y, bubbles: true });
  await pointer('pointerdown', box.x + box.width - 20);
  for (let x = box.x + box.width - 40; x > box.x + 60; x -= 30) await pointer('pointermove', x);
  await pointer('pointerup', box.x + 60);
  await expect(page.locator('[data-slot=swipe-row][data-open=left]')).toBeVisible();
  await page.locator('[data-slot=swipe-row][data-open=left]').getByRole('button', { name: 'Due', exact: true }).tap();
  await page.locator('[data-slot=preset-sheet] [data-preset=nextMonday]').tap();
  await expect.poll(() => showTask('Return library books').task.dueDate).toBe('2026-11-23');
});

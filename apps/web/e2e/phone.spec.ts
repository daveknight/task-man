import { expect, test } from '@playwright/test';
import { openBoard, reseed, row, showTask } from './helpers';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

test('tapping a row opens the bottom sheet', async ({ page }) => {
  await row(page, 'Buy new watch band').getByText('Buy new watch band').tap();
  await expect(page.locator('[data-slot=drawer-content] [data-slot=task-editor]')).toBeVisible();
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

test('rows leave quick actions to the swipe buttons, so the title has the room', async ({ page }) => {
  for (const title of ['Twitter litigation claim', 'Plumber quote for kitchen sink', 'Renew passport']) {
    await expect(row(page, title).getByRole('button')).toHaveCount(1);
    await expect(row(page, title).getByRole('button')).toHaveAccessibleName(new RegExp(`^${title}`));
  }
});

import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { openBoard, reseed, row, showTask } from './helpers';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

test('history is in the more menu, and skip advances a repeating task without finishing it', async ({ page }, testInfo) => {
  await row(page, 'Water the plants').click();
  const editor = page.locator('[data-slot=task-editor]');
  await expect(editor.getByRole('button', { name: 'Skip this occurrence' })).toBeVisible();
  await expect(editor.locator('[data-slot=task-history]')).toHaveCount(0);

  await editor.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'History' }).click();
  const history = editor.locator('[data-slot=task-history]');
  await expect(history.getByRole('heading', { name: 'Task Activities' })).toBeVisible();
  await expect(history).toContainText('created the task');
  await expect(history.locator('[data-kind=skip]')).toHaveCount(0);
  await history.getByRole('button', { name: 'Task' }).click();
  await expect(editor.locator('[data-slot=task-history]')).toHaveCount(0);
  await expect(editor.getByRole('textbox', { name: 'Description' })).toBeVisible();

  await editor.getByRole('button', { name: 'Skip this occurrence' }).click();
  await expect(page.getByText('Skipped “Water the plants”')).toBeVisible();
  await expect.poll(() => showTask('Water the plants').task.dueDate).toBe('2026-11-20');
  expect(showTask('Water the plants').task.completedAt).toBeNull();

  await editor.getByRole('button', { name: 'Skip this occurrence' }).click();
  await expect.poll(() => showTask('Water the plants').task.dueDate).toBe('2026-11-22');
  expect(showTask('Water the plants').task.completedAt).toBeNull();

  await editor.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'History' }).click();
  const skips = history.locator('[data-kind=skip]');
  await expect(skips).toHaveCount(2);
  await expect(skips.nth(0)).toHaveAttribute('data-occurrence', '2026-11-20');
  await expect(skips.nth(0)).toContainText('skipped an occurrence');
  await expect(skips.nth(0)).toContainText('Fri, Nov 20');
  await expect(skips.nth(0).getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(skips.nth(1)).toHaveAttribute('data-occurrence', '2026-11-18');
  await expect(skips.nth(1)).toContainText('Wed, Nov 18');
  await expect(skips.nth(1).getByRole('button', { name: 'Undo' })).toHaveCount(0);

  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await history.screenshot({ path: `/opt/cursor/artifacts/history-${testInfo.project.name}.png` });

  await skips.nth(0).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => showTask('Water the plants').task.dueDate).toBe('2026-11-20');
  await expect(history.locator('[data-kind=skip]')).toHaveCount(1);

  await history.getByRole('button', { name: 'Task' }).click();
  const title = editor.getByRole('textbox', { name: 'Title' });
  await title.fill('Water the bigger plants');
  await title.press('Enter');
  await expect.poll(() => showTask('Water the bigger plants').task.title).toBe('Water the bigger plants');

  await editor.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'History' }).click();
  await expect(history.locator('[data-kind=skip]')).toHaveCount(1);
  await expect(history.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(history.getByRole('listitem').filter({ hasText: 'changed the title' })).toContainText('Water the plants → Water the bigger plants');

  await history.getByRole('button', { name: 'Task' }).click();
  await row(page, 'Buy new watch band').click();
  const other = page.locator('[data-slot=task-editor]');
  await expect(other.getByRole('button', { name: 'Skip this occurrence' })).toHaveCount(0);
  await other.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'History' }).click();
  await expect(other).toContainText('created the task');
  await expect(other.locator('[data-kind=skip]')).toHaveCount(0);
});

test('editing a title shows a task activities card', async ({ page }) => {
  await row(page, 'Buy new watch band').click();
  const editor = page.locator('[data-slot=task-editor]');
  const title = editor.getByRole('textbox', { name: 'Title' });
  await title.fill('Buy a leather watch band');
  await title.press('Enter');
  await expect.poll(() => showTask('Buy a leather watch band').task.title).toBe('Buy a leather watch band');

  await editor.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'History' }).click();
  const history = editor.locator('[data-slot=task-history]');
  const card = history.getByRole('listitem').filter({ hasText: 'changed the title' });
  await expect(card).toContainText('Dev User changed the title');
  await expect(card).toContainText('Buy new watch band → Buy a leather watch band');

  const body = card.locator('[data-slot=history-card-body]');
  const { dark, background } = await body.evaluate((el) => ({
    dark: document.documentElement.classList.contains('dark'),
    background: getComputedStyle(el).backgroundColor,
  }));
  const channels = background.match(/\d+/g)?.map(Number) ?? [];
  expect(channels.length).toBeGreaterThanOrEqual(3);
  const sum = channels[0]! + channels[1]! + channels[2]!;
  if (dark) expect(sum).toBeLessThan(180 * 3);
  else expect(sum).toBeGreaterThan(180 * 3);
});

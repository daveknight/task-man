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
  await expect(history.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(history.getByText('No history.')).toBeVisible();
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
  const rows = history.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute('data-kind', 'skip');
  await expect(rows.nth(0)).toHaveAttribute('data-occurrence', '2026-11-20');
  await expect(rows.nth(0)).toContainText('Skipped');
  await expect(rows.nth(0)).toContainText('Fri, Nov 20');
  await expect(rows.nth(0).getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(rows.nth(1)).toHaveAttribute('data-occurrence', '2026-11-18');
  await expect(rows.nth(1)).toContainText('Wed, Nov 18');
  await expect(rows.nth(1).getByRole('button', { name: 'Undo' })).toHaveCount(0);

  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await history.screenshot({ path: `/opt/cursor/artifacts/history-${testInfo.project.name}.png` });

  await rows.nth(0).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => showTask('Water the plants').task.dueDate).toBe('2026-11-20');
  await expect(rows).toHaveCount(1);

  await history.getByRole('button', { name: 'Task' }).click();
  const title = editor.getByRole('textbox', { name: 'Title' });
  await title.fill('Water the bigger plants');
  await title.press('Enter');
  await expect.poll(() => showTask('Water the bigger plants').task.title).toBe('Water the bigger plants');

  await editor.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'History' }).click();
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await expect(history.getByRole('button', { name: 'Undo' })).toHaveCount(0);

  await history.getByRole('button', { name: 'Task' }).click();
  await row(page, 'Buy new watch band').click();
  const other = page.locator('[data-slot=task-editor]');
  await expect(other.getByRole('button', { name: 'Skip this occurrence' })).toHaveCount(0);
  await other.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'History' }).click();
  await expect(other.getByText('No history.')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { cliJson, reseed, section, titlesIn, TODAY, type CliBoard } from './helpers';

const DRY_CLEANING = 'Add a task to pick up my dry cleaning on Friday';
const DAN = 'Update the task to follow up with Dan to start next Monday, and no task matches';

test.beforeEach(async ({ page }) => {
  reseed();
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`/?today=${TODAY}&capture=replay&slow=1`);
  await expect(page.locator('[data-section=ready] [data-slot=task-row]').first()).toBeVisible();
});

test('capture reviews a create, can drop or cancel it, and saves only on add', async ({ page }) => {
  const dialog = () => page.getByRole('dialog', { name: 'Capture' });

  await page.getByRole('button', { name: 'Capture' }).click();
  await dialog().getByRole('textbox', { name: 'Note' }).fill(DRY_CLEANING);
  await dialog().getByRole('button', { name: 'Done' }).click();
  await expect(dialog().getByText('Thinking…')).toBeVisible();
  await expect(dialog().locator('[data-slot=capture-card-title]')).toHaveText('Pick up dry cleaning');
  await expect(dialog().getByText('Due Fri, Nov 20')).toBeVisible();
  await expect(dialog().getByText('Add a task to pick up dry cleaning, due this Friday.')).toBeVisible();

  await dialog().getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog()).toHaveCount(0);
  await expect(section(page, 'ready').getByText('Pick up dry cleaning')).toHaveCount(0);

  await page.getByRole('button', { name: 'Capture' }).click();
  await dialog().getByRole('textbox', { name: 'Note' }).fill(DAN);
  await dialog().getByRole('button', { name: 'Done' }).click();
  await expect(dialog().getByText('No task was found.')).toBeVisible();
  await expect(dialog().getByText("I couldn't tell what to add. Nothing was saved.")).toBeVisible();
  await expect(dialog().locator('[data-slot=capture-card]')).toHaveCount(0);
  await dialog().getByRole('button', { name: 'Recapture' }).click();
  await expect(dialog().getByRole('textbox', { name: 'Note' })).toHaveValue(DAN);

  await dialog().getByRole('textbox', { name: 'Note' }).fill(DRY_CLEANING);
  await dialog().getByRole('button', { name: 'Done' }).click();
  await dialog().getByRole('button', { name: 'Drop Pick up dry cleaning' }).click();
  await expect(dialog().getByRole('button', { name: /^Add/ })).toHaveCount(0);
  await dialog().getByRole('button', { name: 'Cancel' }).click();
  await expect(section(page, 'ready').getByText('Pick up dry cleaning')).toHaveCount(0);

  await page.getByRole('button', { name: 'Capture' }).click();
  await dialog().getByRole('textbox', { name: 'Note' }).fill(DRY_CLEANING);
  await dialog().getByRole('button', { name: 'Done' }).click();
  await dialog().getByRole('button', { name: 'Add task' }).click();
  await expect(dialog()).toHaveCount(0);
  await expect.poll(async () => (await titlesIn(page, 'ready'))[0]).toBe('Pick up dry cleaning');
  const board = cliJson<CliBoard>('board');
  const task = board.sections.flatMap((item) => item.tasks).find((item) => item.title === 'Pick up dry cleaning');
  expect(task?.dueDate).toBe('2026-11-20');
  expect(task?.status).toBe('open');
});

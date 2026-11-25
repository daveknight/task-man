import { expect, test } from '@playwright/test';
import { cli, cliJson, reseed, section, showTask, titlesIn, TODAY, type CliBoard } from './helpers';

const DRY_CLEANING = 'Add a task to pick up my dry cleaning on Friday';
const DAN_NONE = 'Update the task to follow up with Dan to start next Monday, and no task matches';
const DAN_ONE = 'Update the task to follow up with Dan to start next Monday, and one task title matches';
const DAN_MANY = 'Update the task to follow up with Dan to start next Monday, and several tasks match';
const JEANS = 'Add a note for buying jeans to check out 501 33/33 size, and one jeans task matches';
const GARBAGE_CLOSE = 'Add a task for every Wednesday to take out the garbage, and a close garbage task already exists';

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
  await dialog().getByRole('textbox', { name: 'Note' }).fill(DAN_NONE);
  await dialog().getByRole('button', { name: 'Done' }).click();
  await expect(dialog().getByText('No task was found.')).toBeVisible();
  await expect(dialog().getByText("I couldn't tell what to add. Nothing was saved.")).toHaveCount(0);
  await expect(dialog().locator('[data-slot=capture-card]')).toHaveCount(0);
  await expect(dialog().getByRole('button', { name: /^Add|^Update|^Save/ })).toHaveCount(0);
  await dialog().getByRole('button', { name: 'Recapture' }).click();
  await expect(dialog().getByRole('textbox', { name: 'Note' })).toHaveValue(DAN_NONE);

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

test('capture updates the one matching task and does not create a second one', async ({ page }) => {
  cli('add', 'Follow up with Dan');
  await page.goto(`/?today=${TODAY}&capture=replay&slow=1`);
  await expect(page.locator('[data-section=ready] [data-slot=task-row]').first()).toBeVisible();
  const dialog = () => page.getByRole('dialog', { name: 'Capture' });

  await page.getByRole('button', { name: 'Capture' }).click();
  await dialog().getByRole('textbox', { name: 'Note' }).fill(DAN_ONE);
  await dialog().getByRole('button', { name: 'Done' }).click();
  await expect(dialog().locator('[data-slot=capture-card-title]')).toHaveText('Follow up with Dan');
  await expect(dialog().getByText('Start Mon, Nov 23')).toBeVisible();
  await expect(dialog().locator('[data-slot=capture-picker]')).toHaveCount(0);
  await dialog().getByRole('button', { name: 'Update task' }).click();
  await expect(dialog()).toHaveCount(0);

  await expect.poll(() => showTask('Follow up with Dan').task.startDate).toBe('2026-11-23');
  expect(showTask('Follow up with Dan').placement).toBe('upcoming');
  const board = cliJson<CliBoard>('board');
  const titled = board.sections.flatMap((item) => item.tasks).filter((item) => item.title === 'Follow up with Dan');
  expect(titled).toHaveLength(1);
});

test('capture asks which task and saves nothing until one is picked', async ({ page }) => {
  cli('add', 'Follow up with Dan');
  cli('add', 'Follow up with Dan about the deck');
  await page.goto(`/?today=${TODAY}&capture=replay&slow=1`);
  await expect(page.locator('[data-section=ready] [data-slot=task-row]').first()).toBeVisible();
  const dialog = () => page.getByRole('dialog', { name: 'Capture' });

  await page.getByRole('button', { name: 'Capture' }).click();
  await dialog().getByRole('textbox', { name: 'Note' }).fill(DAN_MANY);
  await dialog().getByRole('button', { name: 'Done' }).click();
  await expect(dialog().getByText('Which task?')).toBeVisible();
  await expect(dialog().getByRole('button', { name: 'Follow up with Dan', exact: true })).toBeVisible();
  await expect(dialog().getByRole('button', { name: 'Follow up with Dan about the deck', exact: true })).toBeVisible();
  await expect(dialog().getByRole('button', { name: 'Update task' })).toHaveCount(0);
  await dialog().getByRole('button', { name: 'Cancel' }).click();
  expect(showTask('Follow up with Dan').task.startDate).toBeNull();
  expect(showTask('Follow up with Dan about the deck').task.startDate).toBeNull();

  await page.getByRole('button', { name: 'Capture' }).click();
  await dialog().getByRole('textbox', { name: 'Note' }).fill(DAN_MANY);
  await dialog().getByRole('button', { name: 'Done' }).click();
  await dialog().getByRole('button', { name: 'Follow up with Dan about the deck', exact: true }).click();
  await expect(dialog().locator('[data-slot=capture-card-title]')).toHaveText('Follow up with Dan about the deck');
  await dialog().getByRole('button', { name: 'Update task' }).click();
  await expect(dialog()).toHaveCount(0);
  await expect.poll(() => showTask('Follow up with Dan about the deck').task.startDate).toBe('2026-11-23');
  expect(showTask('Follow up with Dan').task.startDate).toBeNull();
});

test('capture appends a note and keeps the description', async ({ page }) => {
  cli('add', 'Buy jeans', '--desc', 'Dark wash');
  await page.goto(`/?today=${TODAY}&capture=replay&slow=1`);
  await expect(page.locator('[data-section=ready] [data-slot=task-row]').first()).toBeVisible();
  const dialog = () => page.getByRole('dialog', { name: 'Capture' });

  await page.getByRole('button', { name: 'Capture' }).click();
  await dialog().getByRole('textbox', { name: 'Note' }).fill(JEANS);
  await dialog().getByRole('button', { name: 'Done' }).click();
  await expect(dialog().locator('[data-slot=capture-card-title]')).toHaveText('Buy jeans');
  await expect(dialog().getByText('check out 501 33/33 size', { exact: true })).toBeVisible();
  await dialog().getByRole('button', { name: 'Add note' }).click();
  await expect(dialog()).toHaveCount(0);
  await expect.poll(() => showTask('Buy jeans').task.description).toBe('Dark wash\ncheck out 501 33/33 size');
});

test('capture asks before changing a close task, and can create another instead', async ({ page }) => {
  await page.goto(`/?today=${TODAY}&capture=replay&slow=1`);
  const dialog = () => page.getByRole('dialog', { name: 'Capture' });
  const before = showTask('Take out garbage').task.repeat;

  await page.getByRole('button', { name: 'Capture' }).click();
  await dialog().getByRole('textbox', { name: 'Note' }).fill(GARBAGE_CLOSE);
  await dialog().getByRole('button', { name: 'Done' }).click();
  await expect(dialog().getByText('Update its repeat, or create another?')).toBeVisible();
  await expect(dialog().getByRole('button', { name: /^Add|^Update task|^Save/ })).toHaveCount(0);
  await dialog().getByRole('button', { name: 'Cancel' }).click();
  expect(showTask('Take out garbage').task.repeat).toEqual(before);

  await page.getByRole('button', { name: 'Capture' }).click();
  await dialog().getByRole('textbox', { name: 'Note' }).fill(GARBAGE_CLOSE);
  await dialog().getByRole('button', { name: 'Done' }).click();
  await dialog().getByRole('button', { name: 'Create another' }).click();
  await dialog().getByRole('button', { name: 'Add task' }).click();
  await expect(dialog()).toHaveCount(0);
  await expect.poll(() => showTask('Take out the garbage').task.title).toBe('Take out the garbage');
  expect(showTask('Take out garbage').task.repeat).toEqual(before);
});

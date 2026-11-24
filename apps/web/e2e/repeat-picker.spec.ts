import { expect, test, type Page } from '@playwright/test';
import { openBoard, reseed, row, showTask, TODAY } from './helpers';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

const editor = (page: Page) => page.locator('[data-slot=task-editor]');
const picker = (page: Page) => page.locator('[data-slot=repeat-picker]');
const custom = (page: Page) => page.locator('[data-slot=repeat-custom]');

async function openRepeat(page: Page, title: string) {
  await row(page, title).getByText(title).click();
  await editor(page).locator('[data-field=Repeat]').click();
  await expect(picker(page)).toBeVisible();
}

test('presets set the rule, the field phrase, and the row icon, and No repeat clears it', async ({ page }) => {
  const title = 'Return library books';
  await expect(row(page, title).locator('[data-slot=repeat-icon]')).toHaveCount(0);
  await openRepeat(page, title);
  await expect(picker(page).locator('[data-preset=weekly]')).toHaveText('Weekly on Thursday');
  await expect(picker(page).locator('[data-preset=monthly]')).toHaveText('Monthly on the 19th');
  await expect(picker(page).locator('[data-preset=yearly]')).toHaveText('Yearly on Nov 19');

  await picker(page).locator('[data-preset=daily]').click();
  await expect.poll(() => showTask(title).task.repeat).toMatchObject({ mode: 'schedule', freq: 'daily', interval: 1 });
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('Daily');
  await expect(picker(page).locator('[data-preset=daily]')).toHaveAttribute('aria-pressed', 'true');
  await expect(picker(page).locator('[data-slot=repeat-note]')).toContainText('Repeats from the due date');
  await expect(row(page, title).locator('[data-slot=repeat-icon]')).toBeVisible();

  await picker(page).locator('[data-preset=weekly]').click();
  await expect.poll(() => showTask(title).task.repeat).toMatchObject({ freq: 'weekly', byWeekday: ['thu'] });
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('Weekly on Thu');

  await picker(page).locator('[data-preset=monthly]').click();
  await expect.poll(() => showTask(title).task.repeat).toMatchObject({ freq: 'monthly', monthly: { day: 19 } });
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('Monthly on the 19th');

  await picker(page).locator('[data-preset=yearly]').click();
  await expect.poll(() => showTask(title).task.repeat).toMatchObject({ freq: 'yearly', interval: 1 });
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('Yearly on Nov 19');

  await picker(page).locator('[data-preset=weekdays]').click();
  await expect.poll(() => showTask(title).task.repeat?.byWeekday).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('Every weekday');

  await picker(page).locator('[data-preset=none]').click();
  await expect.poll(() => showTask(title).task.repeat).toBeNull();
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('None');
  await expect(showTask(title).task.dueDate).toBe('2026-11-19');
});

test('a repeat on a task with no due date sets the due date to today', async ({ page }) => {
  const title = 'Replace furnace filter';
  expect(showTask(title).task.dueDate).toBeNull();
  await openRepeat(page, title);
  await picker(page).locator('[data-preset=daily]').click();
  await expect.poll(() => showTask(title).task.dueDate).toBe(TODAY);
  expect(showTask(title).task.repeat).toMatchObject({ freq: 'daily' });
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('Daily');
});

test('a saved repeat shows its phrase, and clearing it leaves the dates', async ({ page }) => {
  await expect(row(page, 'Take out garbage').locator('[data-slot=repeat-icon]')).toBeVisible();
  await row(page, 'Take out garbage').getByText('Take out garbage').click();
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('Weekly on Thu');
  const before = showTask('Take out garbage').task;
  await editor(page).locator('[data-field=Repeat]').click();
  await expect(picker(page).locator('[data-preset=weekly]')).toHaveAttribute('aria-pressed', 'true');
  await picker(page).locator('[data-preset=custom]').click();
  await expect(custom(page).locator('[data-weekday=thu]')).toHaveAttribute('aria-pressed', 'true');
  await custom(page).getByRole('button', { name: 'Repeat', exact: true }).click();
  await picker(page).locator('[data-preset=none]').click();
  await expect.poll(() => showTask('Take out garbage').task.repeat).toBeNull();
  const after = showTask('Take out garbage').task;
  expect(after.dueDate).toBe(before.dueDate);
  expect(after.startDate).toBe(before.startDate);

  await row(page, 'Water the plants').getByText('Water the plants').click();
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('Every 2 days after completion');
});

test('custom weekly: every 2 weeks on Sunday, start early, and a later due date moves the start', async ({ page }) => {
  const title = 'Fix squeaky closet door';
  await openRepeat(page, title);
  await picker(page).locator('[data-preset=custom]').click();
  await expect(custom(page)).toBeVisible();
  await custom(page).getByRole('button', { name: 'Increase interval' }).click();
  await custom(page).getByRole('button', { name: 'Sunday' }).click();
  await custom(page).getByRole('button', { name: 'Wednesday' }).click();
  await custom(page).getByRole('switch', { name: 'Start early' }).click();
  await expect(custom(page).locator('[data-slot="days before due"]')).toContainText('1');
  await custom(page).getByRole('button', { name: 'Done' }).click();

  await expect.poll(() => showTask(title).task.repeat).toMatchObject({ freq: 'weekly', interval: 2, byWeekday: ['sun'], startOffsetDays: 1 });
  expect(showTask(title).task.dueDate).toBe(TODAY);
  expect(showTask(title).task.startDate).toBe('2026-11-17');
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('Every 2 weeks on Sun');
  await expect(row(page, title).locator('[data-slot=repeat-icon]')).toBeVisible();

  await editor(page).locator('[data-field=Due]').click();
  await expect(page.getByRole('button', { name: 'No due date' })).toHaveCount(0);
  await page.getByRole('button', { name: /November 25/ }).click();
  await expect.poll(() => showTask(title).task.dueDate).toBe('2026-11-25');
  expect(showTask(title).task.startDate).toBe('2026-11-24');
});

test('custom monthly ends on a date, after completion ends after a count, and specific dates have no Ends', async ({ page }) => {
  const monthly = 'Call the dentist to move cleaning';
  await openRepeat(page, monthly);
  await picker(page).locator('[data-preset=custom]').click();
  await custom(page).getByRole('button', { name: 'Frequency' }).click();
  await page.getByRole('menuitemradio', { name: 'month', exact: true }).click();
  await expect(custom(page).locator('[data-monthly=day]')).toContainText('On day 18');
  await expect(custom(page).locator('[data-monthly=nth]')).toContainText('On the 3rd Wednesday');
  await custom(page).locator('[data-monthly=last]').click();
  await custom(page).getByRole('button', { name: 'Ends' }).click();
  await page.getByRole('menuitemradio', { name: 'On a date' }).click();
  await expect(custom(page).getByRole('button', { name: 'Ends' })).toContainText('On Dec 18');
  await custom(page).getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => showTask(monthly).task.repeat).toMatchObject({ freq: 'monthly', monthly: { day: -1 }, ends: { onDate: '2026-12-18' } });
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('Monthly on the last day');

  const after = 'Email Grandma the recital video';
  await row(page, after).getByText(after).click();
  await editor(page).locator('[data-field=Repeat]').click();
  await picker(page).locator('[data-preset=custom]').click();
  await custom(page).getByRole('button', { name: 'Repeat type' }).click();
  await page.getByRole('menuitemradio', { name: 'After completion' }).click();
  await custom(page).getByRole('button', { name: 'Increase interval' }).click();
  await expect(custom(page).getByRole('button', { name: 'Sunday' })).toHaveCount(0);
  await expect(custom(page).locator('[data-slot=repeat-note]')).toContainText('Counts from the day you complete it');
  await expect(custom(page).locator('[data-slot=repeat-note]')).not.toContainText('Weekdays');
  await custom(page).getByRole('button', { name: 'Ends' }).click();
  await page.getByRole('menuitemradio', { name: 'After a count' }).click();
  await custom(page).getByRole('button', { name: 'Increase times' }).click();
  await custom(page).getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => showTask(after).task.repeat).toMatchObject({ mode: 'after_completion', freq: 'weekly', interval: 2, ends: { afterCount: 2 } });
  expect(showTask(after).task.dueDate).toBe(TODAY);
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('Every 2 weeks after completion');

  const dates = 'Research 529 plan contribution limits';
  await row(page, dates).getByText(dates).click();
  await editor(page).locator('[data-field=Repeat]').click();
  await picker(page).locator('[data-preset=custom]').click();
  await custom(page).getByRole('button', { name: 'Repeat', exact: true }).click();
  await expect(picker(page)).toBeVisible();
  expect(showTask(dates).task.repeat).toBeNull();
  await picker(page).locator('[data-preset=custom]').click();
  await custom(page).getByRole('button', { name: 'Repeat type' }).click();
  await page.getByRole('menuitemradio', { name: 'On specific dates' }).click();
  await expect(custom(page).locator('[data-slot=repeat-dates]')).toContainText('Nov 25');
  await expect(custom(page).getByText('Ends', { exact: true })).toHaveCount(0);
  await custom(page).getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => showTask(dates).task.repeat).toMatchObject({ mode: 'dates', dates: ['2026-11-25'] });
  expect(showTask(dates).task.dueDate).toBe('2026-11-25');
  await expect(editor(page).locator('[data-slot=repeat-value]')).toHaveText('On Nov 25');
});

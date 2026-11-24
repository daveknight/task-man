import { expect, test } from '@playwright/test';
import { cli, openBoard, reseed, row, showTask } from './helpers';

/**
 * One repeating task per mode, through the board that already exists: the checkbox, the
 * Due picker's "Skip this occurrence", and Undo on the toast. The repeat picker is the next slice.
 */
const MODES = [
  { title: 'Take out garbage', mode: 'schedule', nextDue: '2026-11-26', due: '2026-11-19' },
  { title: 'Water the plants', mode: 'after completion', nextDue: '2026-11-20', due: '2026-11-18' },
  { title: 'Pay estimated quarterly taxes', mode: 'specific dates', nextDue: '2027-04-17', due: '2027-01-17' },
];

test.beforeEach(async ({ page }) => {
  reseed();
  // The dates task is Upcoming, and Upcoming rows have no Due picker, so bring it into Ready first.
  cli('edit', 'Pay estimated quarterly taxes', '--start', 'today');
  await openBoard(page);
});

for (const item of MODES) {
  test(`complete, skip and undo a ${item.mode} task`, async ({ page }) => {
    const task = () => showTask(item.title).task;
    const checkbox = row(page, item.title).getByRole('checkbox', { name: `Complete ${item.title}` });

    await checkbox.click();
    await expect.poll(() => task().dueDate).toBe(item.nextDue);
    expect(task().completedAt).toBeNull();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => task().dueDate).toBe(item.due);
    await expect(row(page, item.title)).toBeVisible();

    await row(page, item.title).hover();
    // A set due date is the button named "Due {date}", not a separate "Due" icon.
    await row(page, item.title).getByRole('button', { name: /^Due / }).click();
    await page.locator('[data-preset=skip]').click();
    await expect.poll(() => task().dueDate).toBe(item.nextDue);
    expect(task().completedAt).toBeNull();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => task().dueDate).toBe(item.due);
  });
}

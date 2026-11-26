import { expect, test, type Page } from '@playwright/test';
import { cli, cliJson, openBoard, reseed, row, showTask, TODAY } from './helpers';

interface LogEntry {
  id: string;
  taskId: string;
  title: string;
  source: 'task' | 'occurrence';
  completedOn: string;
  occurrenceDue: string | null;
}

interface LogWeek {
  start: string;
  end: string;
  collapsedByDefault: boolean;
  count: number;
  days: { date: string; entries: LogEntry[] }[];
}

interface Log {
  today: string;
  weeks: LogWeek[];
}

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

async function openLog(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const item = page.getByRole('menuitem', { name: 'Completed log', exact: true });
  await expect(item).toBeVisible();
  await expect(item.locator('svg')).toHaveCount(0);
  await item.click();
  await expect(page.getByRole('heading', { name: 'Completed log' })).toBeVisible();
}

test('groups finished tasks by week and day, and the rows are read-only', async ({ page }) => {
  const log = cliJson<Log>('log');
  expect(log.today).toBe(TODAY);
  expect(log.weeks.map((week) => [week.start, week.collapsedByDefault, week.days.map((day) => day.entries.map((entry) => entry.title))])).toEqual([
    ['2026-11-16', false, [['Pick up dry cleaning'], ['Assemble bookshelf']]],
    ['2026-11-09', true, [['Pay November credit card bill']]],
    ['2026-11-02', true, [['Order school photos']]],
    ['2026-08-17', true, [['Oil change']]],
  ]);

  await openLog(page);
  const logRoot = page.locator('[data-slot=completed-log]');
  await expect(logRoot.getByRole('button', { name: /This week/ })).toBeVisible();
  await expect(logRoot.getByRole('button', { name: /Last week/ })).toBeVisible();
  await expect(logRoot.getByRole('button', { name: /Nov 2 – Nov 8/ })).toBeVisible();
  await expect(logRoot.getByRole('button', { name: /Aug 17 – Aug 23/ })).toBeVisible();

  const newest = logRoot.locator('[data-log-week="2026-11-16"]');
  await expect(newest.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  await expect(newest.locator('[data-log-day="2026-11-17"]')).toContainText('Yesterday, Nov 17');
  await expect(newest.locator('[data-log-day="2026-11-16"]')).toContainText('Mon, Nov 16');
  await expect(newest.locator('[data-slot=task-title]')).toHaveText(['Pick up dry cleaning', 'Assemble bookshelf']);
  await expect(newest.locator('[data-slot=task-title]').first()).toHaveCSS('text-decoration-line', 'line-through');
  await expect(logRoot.getByRole('checkbox')).toHaveCount(0);
  await expect(logRoot.getByRole('button', { name: /Reorder/ })).toHaveCount(0);

  const lastWeek = logRoot.locator('[data-log-week="2026-11-09"]');
  await expect(lastWeek.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  await expect(lastWeek.locator('[data-slot=task-title]')).toHaveCount(0);
  await lastWeek.getByRole('button').click();
  const bill = lastWeek.locator('[data-slot=log-row]', { hasText: 'Pay November credit card bill' });
  await expect(bill).toBeVisible();
  await expect(bill.locator('[data-slot=due-label]')).toHaveText('Nov 16');
  await expect(bill.locator('[data-slot=due-label]')).toHaveCSS('text-decoration-line', 'line-through');

  await newest.locator('[data-slot=log-row]').first().click({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await newest.locator('[data-slot=log-row]').first().click();
  await expect(page.locator('[data-slot=task-pane]')).toHaveCount(0);
  await expect(page.locator('[data-slot=task-editor]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'TaskMan' })).toBeVisible();
  await expect(page.locator('[data-section=ready]')).toBeVisible();
});

test('lists a repeating completion and leaves a skip out', async ({ page }) => {
  await row(page, 'Water the plants').getByRole('checkbox', { name: 'Complete Water the plants' }).click();
  cli('skip', 'Take out garbage');
  await expect.poll(() => {
    const log = cliJson<Log>('log');
    return log.weeks.flatMap((week) => week.days.flatMap((day) => day.entries)).find((entry) => entry.title === 'Water the plants');
  }).toMatchObject({ source: 'occurrence', completedOn: TODAY, occurrenceDue: TODAY });
  const titles = cliJson<Log>('log').weeks.flatMap((week) => week.days.flatMap((day) => day.entries.map((entry) => entry.title)));
  expect(titles).not.toContain('Take out garbage');
  expect(showTask('Water the plants').task.completedAt).toBeNull();

  await openLog(page);
  const done = page.locator('[data-slot=log-row][data-source=occurrence]', { hasText: 'Water the plants' });
  await expect(done).toBeVisible();
  await expect(done).toHaveAttribute('data-occurrence-due', TODAY);
  await expect(done.locator('[data-slot=repeat-icon]')).toBeVisible();
  await expect(done.locator('[data-slot=due-label]')).toHaveText('Today');
  await expect(done.locator('[data-slot=due-label]')).not.toHaveCSS('text-decoration-line', 'line-through');
  await expect(page.locator('[data-log-day="2026-11-18"]')).toContainText('Today, Nov 18');
  await expect(page.locator('[data-slot=log-row]', { hasText: 'Take out garbage' })).toHaveCount(0);
});

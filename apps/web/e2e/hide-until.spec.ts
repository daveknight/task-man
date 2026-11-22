import { expect, test, type Page } from '@playwright/test';
import { openBoard, reseed, row, section, showTask } from './helpers';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

const editor = (page: Page) => page.locator('[data-slot=task-editor]');
const fields = (page: Page) => editor(page).locator('[data-field]').evaluateAll((els) => els.map((e) => e.getAttribute('data-field')));

test('the detail pane shows Start and Due for Open, Hide until and Due for Waiting, and Due only for In Progress', async ({ page }) => {
  await row(page, 'Get car tires rotated').click();
  await expect(editor(page).getByRole('textbox', { name: 'Title' })).toHaveValue('Get car tires rotated');
  expect(await fields(page)).toEqual(['Start', 'Due']);

  await row(page, 'Reimbursement for conference travel').click();
  await expect(editor(page).getByRole('textbox', { name: 'Title' })).toHaveValue('Reimbursement for conference travel');
  expect(await fields(page)).toEqual(['Hide until', 'Due']);
  await expect(editor(page).locator('[data-field="Hide until"]')).toContainText('Tue, Nov 17');

  await row(page, 'Twitter litigation claim').click();
  await expect(editor(page).getByRole('textbox', { name: 'Title' })).toHaveValue(/Twitter litigation claim/);
  expect(await fields(page)).toEqual(['Due']);
});

test('Don\'t hide in the Waiting detail pane clears the hide-until date and keeps the task in Waiting', async ({ page }) => {
  await section(page, 'waiting').getByText(/hidden until later/).click();
  await row(page, 'Quote from window cleaners').click();
  await editor(page).locator('[data-field="Hide until"]').click();
  await page.getByRole('button', { name: "Don't hide" }).click();
  await expect.poll(() => showTask('Quote from window cleaners')).toMatchObject({ placement: 'waiting', task: { status: 'waiting', hideUntil: null, startDate: null } });
  await expect(editor(page).locator('[data-field="Hide until"]')).toContainText('None');
});

test('moving a Waiting task to Open from the status menu clears hide until silently and shows Start', async ({ page }) => {
  await section(page, 'waiting').getByText(/hidden until later/).click();
  await row(page, 'Warranty replacement for headphones').click();
  await expect(editor(page).locator('[data-field="Hide until"]')).toContainText('Sat, Nov 21');
  await editor(page).locator('[data-slot=status-menu]').click();
  await page.getByRole('menuitemradio', { name: 'Open' }).click();
  await expect.poll(() => showTask('Warranty replacement for headphones')).toMatchObject({ placement: 'ready', task: { status: 'open', hideUntil: null, startDate: null } });
  await expect(page.locator('[data-slot=start-decision-prompt]')).toHaveCount(0);
  await expect.poll(() => fields(page)).toEqual(['Start', 'Due']);
});

test('Upcoming to Waiting clears the start date, the picker has no Keep tile, and the pane switches to Hide until', async ({ page }) => {
  await section(page, 'upcoming').getByRole('button', { name: /^Upcoming/ }).click();
  await row(page, 'Winterize the sprinkler system').click();
  await expect(editor(page).locator('[data-field="Start"]')).toContainText('Nov 25');
  await editor(page).locator('[data-slot=status-menu]').click();
  await page.getByRole('menuitemradio', { name: 'Waiting' }).click();
  const picker = page.locator('[data-slot=wait-pane]');
  await expect(picker.locator('[data-preset=keep]')).toHaveCount(0);
  await picker.locator('[data-preset=week]').click();
  await expect.poll(() => showTask('Winterize the sprinkler system')).toMatchObject({
    placement: 'waiting_later',
    task: { status: 'waiting', startDate: null, hideUntil: '2026-11-25', dueDate: '2026-12-02' },
  });
  await expect.poll(() => fields(page)).toEqual(['Hide until', 'Due']);
  await expect(editor(page).locator('[data-field="Hide until"]')).toContainText('Wed, Nov 25');
});

test('Start now on an Upcoming task shows only its due date in the row and the pane', async ({ page }) => {
  await section(page, 'upcoming').getByRole('button', { name: /^Upcoming/ }).click();
  const title = 'Winterize the sprinkler system';
  await row(page, title).hover();
  await row(page, title).getByRole('button', { name: 'Start now' }).click();
  await expect.poll(() => showTask(title)).toMatchObject({ placement: 'in_progress', task: { status: 'in_progress', startDate: null, hideUntil: null } });
  const moved = section(page, 'in_progress').locator('[data-slot=task-row]', { hasText: title });
  await expect(moved).toContainText('Dec 2');
  await expect(moved).not.toContainText('Nov 25');
  await moved.click();
  await expect.poll(() => fields(page)).toEqual(['Due']);
});

test('rows hidden until later show the hourglass and their hide-until date; Waiting and In Progress rows never show a start date', async ({ page }) => {
  await section(page, 'waiting').getByText(/hidden until later/).click();
  const warranty = row(page, 'Warranty replacement for headphones');
  await expect(warranty.locator('[data-slot=trailing-meta]')).toContainText('Sat');
  await expect(row(page, 'Quote from window cleaners').locator('[data-slot=trailing-meta]')).toContainText('Nov 25');
  // The hourglass is the only date icon on a hidden-until row without a due date.
  await expect(warranty.locator('[data-slot=trailing-meta] svg')).toHaveCount(1);

  // A visible Waiting task with a past hide-until date shows no date for it.
  const reimbursement = row(page, 'Reimbursement for conference travel');
  await expect(reimbursement.locator('[data-slot=trailing-meta]')).toHaveText('Mon');
  const meta = await section(page, 'in_progress').locator('[data-slot=trailing-meta]').allTextContents();
  expect(meta).toEqual(['Nov 28', 'Nov 28'].slice(0, meta.length));
});

test('dragging a hidden-until Waiting task into Upcoming goes straight to the start-date picker', async ({ page }) => {
  await section(page, 'waiting').getByText(/hidden until later/).click();
  await section(page, 'ready').getByRole('button', { name: /^Ready/ }).click();
  await section(page, 'upcoming').getByRole('button', { name: /^Upcoming/ }).click();
  const title = 'Warranty replacement for headphones';
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const source = (await row(page, title).boundingBox())!;
  const target = (await section(page, 'upcoming').locator('[data-drop-target]').boundingBox())!;
  await page.mouse.move(source.x + 40, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 40, source.y + source.height / 2 + 10, { steps: 4 });
  await page.mouse.move(target.x + 40, target.y + target.height / 2, { steps: 15 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(page.locator('[data-slot=upcoming-drop-prompt]')).toHaveCount(0);
  await page.locator('[data-slot=start-pane] [data-preset=tomorrow]').click();
  await expect.poll(() => showTask(title)).toMatchObject({ placement: 'upcoming', task: { status: 'open', startDate: '2026-11-19', hideUntil: null } });
});

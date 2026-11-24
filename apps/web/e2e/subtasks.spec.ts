import { expect, test, type Page } from '@playwright/test';
import { cli, cliJson, openBoard, reseed, row, showTask } from './helpers';

const TASK = 'Order replacement dishwasher rack wheels';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

const card = (page: Page) => page.locator('[data-slot=task-editor] [data-slot=subtasks-card]');
const subtaskRow = (page: Page, title: string) => card(page).locator('[data-slot=subtask-row]', { hasText: title });
const titles = (page: Page) => card(page).locator('[data-slot=subtask-row] [data-slot=subtask-title], [data-slot=subtask-row] [data-slot=subtask-input]').evaluateAll((els) => els.map((e) => (e instanceof HTMLInputElement ? e.value : e.textContent?.trim() ?? '')));
const stored = (title = TASK) => showTask(title).task.subtasks.map((s) => ({ title: s.title, done: s.done }));

async function openTask(page: Page, title = TASK) {
  await row(page, title).click();
  await expect(card(page)).toBeVisible();
}

/** Drags a subtask's handle in steps, so dnd-kit sees a real drag. */
async function dragSubtask(page: Page, from: string, onto: string, where: 'above' | 'below' = 'above') {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const source = await subtaskRow(page, from).getByRole('button', { name: /^Reorder/ }).boundingBox();
  const target = await subtaskRow(page, onto).boundingBox();
  if (!source || !target) throw new Error('subtask not visible');
  const grab = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x, grab.y + (target.y > grab.y ? 8 : -8), { steps: 4 });
  await page.mouse.move(grab.x, where === 'above' ? target.y + 4 : target.y + target.height - 4, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

test('every row with subtasks shows done of total, matching the CLI', async ({ page }) => {
  const board = cliJson<{ sections: { tasks: { title: string; subtaskCount: { done: number; total: number } }[] }[] }>('board', '--completed');
  const withSubtasks = board.sections.flatMap((s) => s.tasks).filter((t) => t.subtaskCount.total > 0);
  expect(withSubtasks.length).toBeGreaterThanOrEqual(4);
  for (const t of withSubtasks.filter((t) => ['Draft holiday card list', 'Finance quarterly action items', TASK].includes(t.title))) {
    await expect(row(page, t.title).locator('[data-slot=subtask-count]')).toContainText(`${t.subtaskCount.done}/${t.subtaskCount.total}`);
  }
  await expect(row(page, 'Buy new watch band').locator('[data-slot=subtask-count]')).toHaveCount(0);
});

test('the Subtasks card shows the subtasks in order, the done ones struck through, and the count', async ({ page }) => {
  await openTask(page, 'Finance quarterly action items');
  await expect(card(page).locator('[data-slot=subtasks-progress]')).toHaveText('1 of 3');
  expect(await titles(page)).toEqual(['Budget review', 'Rebalance', 'Net worth sheet']);
  await expect(subtaskRow(page, 'Budget review').getByRole('checkbox')).toBeChecked();
  await expect(subtaskRow(page, 'Budget review').locator('[data-slot=subtask-title]')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(subtaskRow(page, 'Rebalance').getByRole('checkbox')).not.toBeChecked();
  await expect(subtaskRow(page, 'Rebalance').locator('[data-slot=subtask-title]')).toHaveCSS('text-decoration-line', 'none');
});

test('a task with no subtasks shows only the header and Add subtask, with no count', async ({ page }) => {
  await openTask(page, 'Buy new watch band');
  await expect(card(page).locator('[data-slot=subtask-row]')).toHaveCount(0);
  await expect(card(page).locator('[data-slot=subtasks-progress]')).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: 'Add subtask' })).toBeVisible();
});

test('the card sits between the dates and the description', async ({ page }) => {
  await openTask(page);
  const order = await page.locator('[data-slot=task-editor]').evaluate((editor) => {
    const y = (el: Element | null) => el!.getBoundingClientRect().y;
    return [y(editor.querySelector('[data-field=Due]')), y(editor.querySelector('[data-slot=subtasks-card]')), y(editor.querySelector('textarea[aria-label=Description]'))];
  });
  expect(order).toEqual([...order].sort((a, b) => a - b));
});

test('Return saves a subtask and offers another; Escape finishes; the row count follows', async ({ page }) => {
  await openTask(page);
  await card(page).getByRole('button', { name: 'Add subtask' }).click();
  await expect(card(page).locator('[data-slot=subtasks-hint]')).toHaveText('Return saves and adds another. Escape finishes.');
  await page.keyboard.type('Measure the old wheel');
  await page.keyboard.press('Enter');
  await expect(card(page).getByRole('textbox', { name: 'New subtask' })).toBeFocused();
  await expect(card(page).getByRole('textbox', { name: 'New subtask' })).toHaveValue('');
  await page.keyboard.type('Compare prices');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(card(page).locator('[data-slot=subtask-input]')).toHaveCount(0);
  await expect(card(page).locator('[data-slot=subtasks-hint]')).toHaveCount(0);
  // Escape only finished the list: the task stays open.
  await expect(page.locator('[data-slot=task-editor]')).toBeVisible();
  expect(await titles(page)).toEqual(['Find model number', 'Order from parts site', 'Measure the old wheel', 'Compare prices']);
  await expect.poll(stored).toEqual([
    { title: 'Find model number', done: false },
    { title: 'Order from parts site', done: false },
    { title: 'Measure the old wheel', done: false },
    { title: 'Compare prices', done: false },
  ]);
  await expect(card(page).locator('[data-slot=subtasks-progress]')).toHaveText('0 of 4');
  await expect(row(page, TASK).locator('[data-slot=subtask-count]')).toContainText('0/4');
});

test('Return on an empty new subtask finishes, and Escape drops what was typed', async ({ page }) => {
  await openTask(page);
  await card(page).getByRole('button', { name: 'Add subtask' }).click();
  await page.keyboard.press('Enter');
  await expect(card(page).locator('[data-slot=subtask-input]')).toHaveCount(0);

  await card(page).getByRole('button', { name: 'Add subtask' }).click();
  await page.keyboard.type('Never saved');
  await page.keyboard.press('Escape');
  await expect(card(page).locator('[data-slot=subtask-input]')).toHaveCount(0);
  expect(await titles(page)).toEqual(['Find model number', 'Order from parts site']);
  expect(stored()).toHaveLength(2);
});

test('leaving the field saves what was typed', async ({ page }) => {
  await openTask(page);
  await card(page).getByRole('button', { name: 'Add subtask' }).click();
  await page.keyboard.type('Saved on blur');
  await page.locator('[data-slot=task-editor]').getByRole('textbox', { name: 'Description' }).click();
  await expect.poll(() => stored().map((s) => s.title)).toEqual(['Find model number', 'Order from parts site', 'Saved on blur']);
});

test('ticking a subtask updates the sheet, the row and the database, and unticking undoes it', async ({ page }) => {
  await openTask(page);
  await subtaskRow(page, 'Find model number').getByRole('checkbox').click();
  await expect(subtaskRow(page, 'Find model number').locator('[data-slot=subtask-title]')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(card(page).locator('[data-slot=subtasks-progress]')).toHaveText('1 of 2');
  await expect(row(page, TASK).locator('[data-slot=subtask-count]')).toContainText('1/2');
  await expect.poll(stored).toEqual([
    { title: 'Find model number', done: true },
    { title: 'Order from parts site', done: false },
  ]);
  expect(showTask(TASK).subtaskCount).toEqual({ done: 1, total: 2 });
  // Ticking the last one doesn't complete the task.
  await subtaskRow(page, 'Order from parts site').getByRole('checkbox').click();
  await expect(card(page).locator('[data-slot=subtasks-progress]')).toHaveText('2 of 2');
  await expect(row(page, TASK).locator('[data-slot=subtask-count]')).toContainText('2/2');
  await expect.poll(() => showTask(TASK).subtaskCount).toEqual({ done: 2, total: 2 });
  expect(showTask(TASK).task.completedAt).toBeNull();

  await subtaskRow(page, 'Find model number').getByRole('checkbox').click();
  await expect(card(page).locator('[data-slot=subtasks-progress]')).toHaveText('1 of 2');
  await expect.poll(stored).toEqual([
    { title: 'Find model number', done: false },
    { title: 'Order from parts site', done: true },
  ]);
});

test('clicking a subtask edits it in place; Return saves, Escape puts it back', async ({ page }) => {
  await openTask(page);
  const second = card(page).locator('[data-slot=subtask-row]').nth(1);
  await second.locator('[data-slot=subtask-title]').click();
  await expect(second.getByRole('textbox', { name: 'Subtask title' })).toBeFocused();
  await page.keyboard.type(' and a thermos');
  await page.keyboard.press('Escape');
  expect(await titles(page)).toEqual(['Find model number', 'Order from parts site']);
  expect(stored()[1]!.title).toBe('Order from parts site');

  await second.locator('[data-slot=subtask-title]').click();
  await page.keyboard.type(' today');
  await page.keyboard.press('Enter');
  // Return on an edit saves it and offers another new subtask.
  await expect(card(page).getByRole('textbox', { name: 'New subtask' })).toBeFocused();
  await expect.poll(() => stored()[1]!.title).toBe('Order from parts site today');
  await page.keyboard.press('Escape');
  expect(await titles(page)).toEqual(['Find model number', 'Order from parts site today']);
});

test('clearing a subtask and pressing Return deletes it', async ({ page }) => {
  await openTask(page);
  await subtaskRow(page, 'Find model number').locator('[data-slot=subtask-title]').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(subtaskRow(page, 'Find model number')).toHaveCount(0);
  await expect.poll(stored).toEqual([{ title: 'Order from parts site', done: false }]);
  await expect(row(page, TASK).locator('[data-slot=subtask-count]')).toContainText('0/1');
});

test('the delete button on a hovered subtask removes it, and the count drops', async ({ page }) => {
  await openTask(page);
  await subtaskRow(page, 'Order from parts site').hover();
  await subtaskRow(page, 'Order from parts site').getByRole('button', { name: 'Delete Order from parts site' }).click();
  await expect(subtaskRow(page, 'Order from parts site')).toHaveCount(0);
  await expect.poll(stored).toEqual([{ title: 'Find model number', done: false }]);
  await subtaskRow(page, 'Find model number').hover();
  await subtaskRow(page, 'Find model number').getByRole('button', { name: 'Delete Find model number' }).click();
  await expect.poll(stored).toEqual([]);
  await expect(row(page, TASK).locator('[data-slot=subtask-count]')).toHaveCount(0);
  await expect(card(page).locator('[data-slot=subtasks-progress]')).toHaveCount(0);
});

test('dragging a subtask by its handle reorders it, and the order survives a reload', async ({ page }) => {
  await openTask(page, 'Draft holiday card list');
  expect(await titles(page)).toEqual(['Pull addresses from last year', 'Add new neighbors', 'Order cards']);
  await dragSubtask(page, 'Order cards', 'Pull addresses', 'above');
  await expect.poll(() => titles(page)).toEqual(['Order cards', 'Pull addresses from last year', 'Add new neighbors']);
  await expect.poll(() => showTask('Draft holiday card list').task.subtasks.map((s) => s.title)).toEqual(['Order cards', 'Pull addresses from last year', 'Add new neighbors']);

  await dragSubtask(page, 'Order cards', 'Add new neighbors', 'below');
  await expect.poll(() => showTask('Draft holiday card list').task.subtasks.map((s) => s.title)).toEqual(['Pull addresses from last year', 'Add new neighbors', 'Order cards']);

  await page.reload();
  await row(page, 'Draft holiday card list').click();
  await expect.poll(() => titles(page)).toEqual(['Pull addresses from last year', 'Add new neighbors', 'Order cards']);
  // A reorder doesn't touch the ticks.
  await expect(subtaskRow(page, 'Pull addresses').getByRole('checkbox')).toBeChecked();
});

test('the drag handle shows only on a hovered subtask, in its own column', async ({ page }) => {
  await openTask(page);
  const handle = subtaskRow(page, 'Find model number').getByRole('button', { name: /^Reorder/ });
  await expect(handle).toHaveCSS('opacity', '0');
  await subtaskRow(page, 'Find model number').hover();
  await expect(handle).toHaveCSS('opacity', '1');
  const box = (await handle.boundingBox())!;
  const check = (await subtaskRow(page, 'Find model number').getByRole('checkbox').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(check.x);
});

test('subtasks added with the CLI show up in the board and the sheet after a reload', async ({ page }) => {
  cli('edit', TASK, '--add-subtask', 'Measure the old wheel', '--done-subtask', '1');
  await page.reload();
  await expect(row(page, TASK).locator('[data-slot=subtask-count]')).toContainText('1/3');
  await row(page, TASK).click();
  expect(await titles(page)).toEqual(['Find model number', 'Order from parts site', 'Measure the old wheel']);
  await expect(subtaskRow(page, 'Find model number').getByRole('checkbox')).toBeChecked();
});

test('a completed task keeps its subtasks and still shows the count', async ({ page }) => {
  cli('done', TASK);
  await page.reload();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Show completed' }).click();
  await page.keyboard.press('Escape');
  await page.locator('[data-section=completed]').getByRole('button', { name: /^Completed/ }).click();
  await expect(row(page, TASK).locator('[data-slot=subtask-count]')).toContainText('0/2');
});

test('a task in Trash shows its subtasks without letting them change', async ({ page }) => {
  cli('delete', TASK);
  await page.reload();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Show deleted' }).click();
  await row(page, TASK).click();
  expect(await titles(page)).toEqual(['Find model number', 'Order from parts site']);
  await expect(subtaskRow(page, 'Find model number').getByRole('checkbox')).toBeDisabled();
  await expect(card(page).getByRole('button', { name: 'Add subtask' })).toHaveCount(0);
  await expect(subtaskRow(page, 'Find model number').getByRole('button', { name: /^Reorder/ })).toHaveCount(0);
});

test('restoring a task from Trash brings its subtasks with it', async () => {
  cli('delete', TASK);
  cli('restore', TASK);
  expect(stored()).toHaveLength(2);
});

test('deleting a task forever takes its subtasks too', async () => {
  const id = showTask(TASK).task.id;
  cli('delete', TASK);
  cli('delete', TASK, '--forever');
  expect(() => showTask(id)).toThrow();
  expect(cliJson<{ subtasks?: unknown[] }>('export').subtasks?.some((s) => (s as { task_id: string }).task_id === id)).toBe(false);
});

test('in the overlay sheet, Escape finishes the list without closing the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await row(page, TASK).getByText(TASK).click();
  const sheet = page.locator('[data-slot=sheet-content]');
  await expect(sheet.locator('[data-slot=subtasks-card]')).toBeVisible();
  await sheet.getByRole('button', { name: 'Add subtask' }).click();
  await page.keyboard.type('Measure the old wheel');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(sheet.locator('[data-slot=subtask-input]')).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-slot=subtasks-progress]')).toHaveText('0 of 3');
  await expect.poll(() => stored().map((s) => s.title)).toEqual(['Find model number', 'Order from parts site', 'Measure the old wheel']);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

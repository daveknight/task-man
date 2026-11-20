import { expect, test, type Page } from '@playwright/test';
import { cliJson, findTask, openBoard, reseed, row, section, showTask, titlesIn, TODAY, type CliBoard } from './helpers';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

/** Drags with the mouse in steps, so dnd-kit sees a real drag. */
async function drag(page: Page, from: string, to: { title?: string; section?: string }, position: 'above' | 'below' = 'above') {
  const source = await row(page, from).boundingBox();
  const target = to.title ? await row(page, to.title).boundingBox() : await section(page, to.section!).locator('[data-drop-target]').boundingBox();
  if (!source || !target) throw new Error('row not visible');
  await page.mouse.move(source.x + 40, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 40, source.y + source.height / 2 + 10, { steps: 4 });
  const y = to.title ? target.y + (position === 'above' ? 4 : target.height - 4) : target.y + target.height / 2;
  await page.mouse.move(target.x + 40, y, { steps: 15 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

test('matches the CLI board', async ({ page }) => {
  const board = cliJson<CliBoard>('board');
  for (const s of board.sections) {
    await expect(section(page, s.id).locator('[data-slot=section-count]')).toHaveText(String(s.count));
    if (s.id === 'upcoming') continue;
    expect(await titlesIn(page, s.id)).toEqual(s.tasks.map((t) => t.title));
  }
  await expect(section(page, 'waiting').getByText(`Show ${board.sections.find((s) => s.id === 'waiting')!.later!.length} hidden until later`)).toBeVisible();
});

test('a collapsed section expands from anywhere in its row', async ({ page }) => {
  const trigger = section(page, 'upcoming').getByRole('button', { name: /^Upcoming/ });
  await expect(section(page, 'upcoming').locator('[data-slot=task-row]')).toHaveCount(0);
  await trigger.scrollIntoViewIfNeeded();
  const box = (await trigger.boundingBox())!;
  const board = (await page.locator('[data-slot=board]').boundingBox())!;
  await page.mouse.click(board.x + board.width - 20, box.y + box.height / 2);
  await expect(section(page, 'upcoming').locator('[data-slot=task-row]').first()).toBeVisible();
});

test('complete with undo', async ({ page }) => {
  await page.getByRole('checkbox', { name: 'Complete Buy new watch band' }).click();
  await expect(section(page, 'ready').getByText('Buy new watch band')).toHaveCount(0);
  expect(showTask('Buy new watch band').task.completedAt).not.toBeNull();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row(page, 'Buy new watch band')).toBeVisible();
  await expect.poll(() => showTask('Buy new watch band').task.completedAt).toBeNull();
});

test('+1 day moves a later due date by a day; overdue tasks get Tomorrow instead', async ({ page }) => {
  await row(page, 'Renew passport').hover();
  await row(page, 'Renew passport').getByRole('button', { name: 'Due' }).click();
  await expect(page.locator('[data-preset=plus1d]')).toHaveCount(0);
  await page.locator('[data-preset=tomorrow]').click();
  await expect.poll(() => showTask('Renew passport').task.dueDate).toBe('2026-11-19');
  await expect(page.locator('[data-slot=preset-panel]')).toHaveCount(0);

  await row(page, 'Get car tires rotated').hover();
  await row(page, 'Get car tires rotated').getByRole('button', { name: 'Due' }).click();
  await page.locator('[data-preset=plus1d]').click();
  await expect.poll(() => showTask('Get car tires rotated').task.dueDate).toBe('2026-12-01');
});

test('status change to Waiting asks when to hide it, with Don\'t hide by default', async ({ page }) => {
  await row(page, 'Buy new watch band').click();
  await page.locator('[data-slot=status-menu]').click();
  await page.getByRole('menuitemradio', { name: 'Waiting' }).click();
  const pane = page.locator('[data-slot=wait-pane]');
  await expect(pane).toBeVisible();
  await expect(pane.locator('[data-slot=dialog-title]')).toHaveText('Hide until');
  await expect(pane.getByText(/come back for follow-up/)).toHaveCount(0);
  await expect(pane.locator('[data-preset=noDate]')).toHaveAttribute('data-default', 'true');
  await expect(pane.locator('[data-preset=noDate]')).toHaveText(/Don't hide/);
  await pane.locator('[data-preset=tomorrow]').click();
  await expect.poll(() => showTask('Buy new watch band').task).toMatchObject({ status: 'waiting', startDate: '2026-11-19' });
  await expect(section(page, 'waiting').getByText('Show 3 hidden until later')).toBeVisible();
});

test('Waiting row buttons show what they do', async ({ page }) => {
  const plumber = row(page, 'Plumber quote for kitchen sink');
  const tip = page.locator('[data-slot=tooltip-content][data-open]');
  await plumber.getByRole('button', { name: 'Extend wait' }).hover();
  await expect(tip).toHaveText('Hide until a later date');
  await plumber.getByRole('button', { name: 'Extend wait' }).click();
  await expect(page.locator('[data-slot=preset-panel]')).toBeVisible();
  await page.keyboard.press('Escape');
  await plumber.getByRole('button', { name: 'Move to In Progress' }).hover();
  await expect(tip).toHaveText('Move to In Progress');
});

test('Move to In Progress on a Waiting task', async ({ page }) => {
  await row(page, 'Plumber quote for kitchen sink').getByRole('button', { name: 'Move to In Progress' }).click();
  await expect(section(page, 'in_progress').getByText('Plumber quote for kitchen sink')).toBeVisible();
  expect(showTask('Plumber quote for kitchen sink').task.status).toBe('in_progress');
});

test('leaving Waiting when the hide date is after the due date only offers clearing it', async ({ page }) => {
  const title = 'Contractor sign-off on deck permit';
  await row(page, title).getByRole('button', { name: 'Move to In Progress' }).click();
  const prompt = page.locator('[data-slot=start-decision-prompt]');
  await expect(prompt.locator('[data-slot=dialog-title]')).toHaveText('Move and clear start date?');
  await expect(prompt.locator('[data-answer]')).toHaveCount(1);
  await expect(prompt.getByRole('button', { name: 'Yes, clear start date' })).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await prompt.getByRole('button', { name: 'Yes, clear start date' }).click();
  await expect.poll(() => showTask(title).task).toMatchObject({ status: 'in_progress', startDate: null, dueDate: TODAY });
});

test('leaving Waiting with a future hide date before the due date still offers keep and pick', async ({ page }) => {
  const title = 'Warranty replacement for headphones';
  await section(page, 'waiting').getByText(/hidden until later/).click();
  await row(page, title).hover();
  await row(page, title).getByRole('button', { name: 'Move to In Progress' }).click();
  const prompt = page.locator('[data-slot=start-decision-prompt]');
  await expect(prompt.locator('[data-slot=dialog-title]')).toHaveText('Move to In Progress');
  await expect(prompt.locator('[data-answer=clear]')).toContainText('Clear the hide-until date');
  await expect(prompt).toContainText("It's hidden until");
  await expect(prompt.locator('[data-answer=keep]')).toBeVisible();
  await expect(prompt.locator('[data-answer=set]')).toBeVisible();
  await prompt.getByRole('button', { name: 'Cancel' }).click();
  expect(showTask(title).task).toMatchObject({ status: 'waiting', startDate: '2026-11-21' });
});

test('drag to reorder within Ready persists', async ({ page }) => {
  const before = await titlesIn(page, 'ready');
  await drag(page, before[2]!, { title: before[0]! }, 'above');
  await expect.poll(() => titlesIn(page, 'ready')).toEqual([before[2], before[0], before[1], ...before.slice(3)]);
  await page.reload();
  await expect.poll(() => titlesIn(page, 'ready')).toEqual([before[2], before[0], before[1], ...before.slice(3)]);
  const cli = cliJson<CliBoard>('board').sections.find((s) => s.id === 'ready')!;
  expect(cli.tasks.slice(0, 3).map((t) => t.title)).toEqual([before[2], before[0], before[1]]);
});

test('drag from Ready into Waiting opens the hide-until picker', async ({ page }) => {
  await drag(page, 'Replace furnace filter', { title: 'Plumber quote for kitchen sink' }, 'above');
  const pane = page.locator('[data-slot=wait-pane]');
  await expect(pane).toBeVisible();
  await pane.locator('[data-preset=noDate]').click();
  await expect.poll(() => titlesIn(page, 'waiting')).toContain('Replace furnace filter');
  expect((await titlesIn(page, 'waiting'))[0]).toBe('Replace furnace filter');
  expect(showTask('Replace furnace filter').task).toMatchObject({ status: 'waiting', startDate: null });
});

test('drag from Waiting into Upcoming asks for a start date and makes the task Open', async ({ page }) => {
  await section(page, 'ready').getByRole('button', { name: /^Ready/ }).click();
  await section(page, 'upcoming').getByRole('button', { name: /^Upcoming/ }).click();
  await drag(page, 'Hear back from school about field trip form', { section: 'upcoming' });
  const pane = page.locator('[data-slot=start-pane]');
  await expect(pane).toBeVisible();
  expect(await pane.locator('[data-preset]').evaluateAll((els) => els.map((e) => e.getAttribute('data-preset')))).toEqual(['tomorrow', 'week', 'twoWeeks', 'pick']);
  await pane.locator('[data-preset=tomorrow]').click();
  await expect.poll(() => showTask('Hear back from school about field trip form')).toMatchObject({
    placement: 'upcoming',
    task: { status: 'open', startDate: '2026-11-19' },
  });
});

for (const choice of ['clear_due', 'cancel'] as const) {
  test(`drag a task due today into Upcoming asks first: ${choice === 'clear_due' ? 'Remove due date' : 'Cancel'}`, async ({ page }) => {
    const title = 'Contractor sign-off on deck permit';
    await section(page, 'ready').getByRole('button', { name: /^Ready/ }).click();
    await section(page, 'upcoming').getByRole('button', { name: /^Upcoming/ }).click();
    await drag(page, title, { section: 'upcoming' });
    const prompt = page.locator('[data-slot=upcoming-drop-prompt]');
    await expect(prompt).toBeVisible();
    await prompt.locator(`[data-choice=${choice}]`).click();
    await expect(prompt).toBeHidden();
    if (choice === 'cancel') {
      await expect(page.locator('[data-slot=start-pane]')).toHaveCount(0);
      expect(await titlesIn(page, 'waiting')).toContain(title);
      expect(showTask(title)).toMatchObject({ placement: 'waiting', task: { status: 'waiting', dueDate: TODAY, startDate: '2026-11-25' } });
      return;
    }
    const pane = page.locator('[data-slot=start-pane]');
    expect(await pane.locator('[data-preset]').evaluateAll((els) => els.map((e) => e.getAttribute('data-preset')))).toEqual(['tomorrow', 'week', 'twoWeeks', 'pick']);
    await pane.locator('[data-preset=week]').click();
    await expect.poll(() => showTask(title)).toMatchObject({ placement: 'upcoming', task: { status: 'open', dueDate: null, startDate: '2026-11-25' } });
  });
}

test('quick add puts the task at the top of Ready', async ({ page }) => {
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('textbox', { name: 'New task' }).fill('Book flu shots for the family');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await titlesIn(page, 'ready'))[0]).toBe('Book flu shots for the family');
  await expect.poll(() => findTask('Book flu shots for the family')?.placement).toBe('ready');
});

test('task sheet edits save', async ({ page }) => {
  await row(page, 'Fix squeaky closet door').click();
  const editor = page.locator('[data-slot=task-editor]');
  await editor.getByRole('textbox', { name: 'Title' }).fill('Fix squeaky bedroom door');
  const description = editor.getByRole('textbox', { name: 'Description' });
  await description.click();
  await page.keyboard.type('- WD-40');
  await page.keyboard.press('Enter');
  await page.keyboard.type('hinge pins');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('done');
  await editor.getByRole('button', { name: 'Flag' }).click();
  await expect.poll(() => showTask('Fix squeaky bedroom door').task).toMatchObject({
    title: 'Fix squeaky bedroom door',
    description: '- WD-40\n- hinge pins\ndone',
    flagged: true,
  });
});

test('search, then delete and restore from Trash', async ({ page }) => {
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByPlaceholder('Search tasks').fill('passport');
  await page.getByRole('option', { name: /Renew passport/ }).click();
  const editor = page.locator('[data-slot=task-editor]');
  await expect(editor.getByRole('textbox', { name: 'Title' })).toHaveValue('Renew passport');

  await editor.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(section(page, 'ready').getByText('Renew passport')).toHaveCount(0);

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Trash' }).click();
  await row(page, 'Renew passport').hover();
  await row(page, 'Renew passport').getByRole('button', { name: 'Restore' }).click();
  await expect.poll(() => showTask('Renew passport').task.deletedAt).toBeNull();
});

test('search: Only flagged narrows the results to flagged tasks', async ({ page }) => {
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByPlaceholder('Search tasks').fill('pa');
  await expect(page.getByRole('option', { name: /Pay the gardener/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Renew passport/ })).toBeVisible();

  await page.getByRole('button', { name: 'Only flagged' }).click();
  await expect(page.getByRole('option', { name: /Pay the gardener/ })).toHaveCount(0);
  await page.getByRole('option', { name: /Renew passport/ }).click();
  await expect(page.locator('[data-slot=task-editor]').getByRole('textbox', { name: 'Title' })).toHaveValue('Renew passport');
});

test('offline: read-only with a banner, nothing is written', async ({ page, context }) => {
  await context.setOffline(true);
  await expect(page.locator('[data-slot=offline-banner]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add task' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Complete Buy new watch band' }).click();
  await expect(page.getByText("You're offline. Changes are paused until you're back online.")).toBeVisible();
  await expect(row(page, 'Buy new watch band')).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator('[data-slot=offline-banner]')).toHaveCount(0);
  expect(showTask('Buy new watch band').task.completedAt).toBeNull();
});

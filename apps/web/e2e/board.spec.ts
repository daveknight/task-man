import { expect, test, type Locator, type Page } from '@playwright/test';
import { cli, cliJson, findTask, openBoard, reseed, row, section, showTask, titlesIn, TODAY, type CliBoard } from './helpers';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

/** Waits for section folds to finish, so bounding boxes are final. */
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().length === 0);

/** Drags with the mouse in steps, so dnd-kit sees a real drag. */
async function drag(page: Page, from: string, to: { title?: string; section?: string }, position: 'above' | 'below' = 'above') {
  await settled(page);
  const source = await row(page, from).getByRole('button', { name: /^Reorder/ }).boundingBox();
  const target = to.title ? await row(page, to.title).boundingBox() : await section(page, to.section!).locator('[data-drop-target]').boundingBox();
  if (!source || !target) throw new Error('row not visible');
  const grab = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x, grab.y + 10, { steps: 4 });
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

test('a section folds and unfolds without its heading moving, and snaps with reduced motion', async ({ page }) => {
  const trigger = section(page, 'in_progress').getByRole('button', { name: /^In Progress/ });
  const rows = section(page, 'in_progress').locator('[data-slot=task-row]');
  /** Clicks the heading and samples its title and caret (by center, since it rotates) every frame until the fold settles. */
  const toggle = async () => {
    await page.evaluate(() => {
      const heading = document.querySelector('[data-section=in_progress] [data-slot=collapsible-trigger]')!;
      const place = () => {
        const title = heading.querySelector('.optical-center')!.getBoundingClientRect();
        const caret = heading.querySelector('svg')!.getBoundingClientRect();
        return [title.x, title.y, caret.x + caret.width / 2, caret.y + caret.height / 2].map((n) => n.toFixed(1)).join();
      };
      const w = window as unknown as { samples: Promise<{ places: string[]; animated: boolean }> };
      w.samples = new Promise((done) => {
        const places: string[] = [];
        let animated = false;
        let frames = 0;
        const tick = () => {
          places.push(place());
          animated ||= document.getAnimations().length > 0;
          if (++frames < 40) requestAnimationFrame(tick);
          else done({ places, animated });
        };
        requestAnimationFrame(tick);
      });
    });
    await trigger.click();
    return page.evaluate(() => (window as unknown as { samples: Promise<{ places: string[]; animated: boolean }> }).samples);
  };

  await expect(rows.first()).toBeVisible();
  const collapse = await toggle();
  await expect(rows).toHaveCount(0);
  expect(collapse.animated).toBe(true);
  expect(new Set(collapse.places).size).toBe(1);

  const expand = await toggle();
  await expect(rows.first()).toBeVisible();
  expect(expand.animated).toBe(true);
  expect(new Set([...collapse.places, ...expand.places]).size).toBe(1);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await toggle();
  await expect(rows).toHaveCount(0);
  expect(reduced.animated).toBe(false);
  expect(new Set([...collapse.places, ...reduced.places]).size).toBe(1);
});

test('Upcoming rows show the due date and flag but not the start date, which stays in the sheet', async ({ page }) => {
  cli('edit', 'Winterize the sprinkler system', '--flag');
  await page.reload();
  await section(page, 'upcoming').getByRole('button', { name: /^Upcoming/ }).click();
  const upcoming = row(page, 'Winterize the sprinkler system');
  await expect(upcoming).toContainText('Dec 2');
  await expect(upcoming.getByLabel('Flagged')).toBeVisible();
  await expect(upcoming).not.toContainText('Nov 25');
  await upcoming.click();
  await expect(page.locator('[data-slot=task-editor]').getByRole('button', { name: /^Start/ })).toContainText('Wed, Nov 25');
});

test('the date pickers name what clearing does: No start date and No due date', async ({ page }) => {
  await section(page, 'upcoming').getByRole('button', { name: /^Upcoming/ }).click();
  const upcoming = row(page, 'Winterize the sprinkler system');
  await upcoming.hover();
  await upcoming.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('[data-preset=clear]')).toHaveText('No start date');
  await page.locator('[data-preset=clear]').click();
  await expect.poll(() => showTask('Winterize the sprinkler system').task.startDate).toBeNull();

  await row(page, 'Renew passport').hover();
  await row(page, 'Renew passport').getByRole('button', { name: 'Due' }).click();
  await expect(page.locator('[data-preset=clear]')).toHaveText('No due date');
  await page.keyboard.press('Escape');

  // Pay the gardener repeats, so its sheet hides "No due date".
  await row(page, 'Renew passport').click();
  const editor = page.locator('[data-slot=task-editor]');
  await editor.getByRole('button', { name: /^Due/ }).click();
  await expect(page.getByRole('button', { name: 'No due date' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Clear', exact: true })).toHaveCount(0);
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
  await expect.poll(() => showTask('Buy new watch band').task).toMatchObject({ status: 'waiting', hideUntil: '2026-11-19', startDate: null });
  await expect(section(page, 'waiting').getByText('Show 3 hidden until later')).toBeVisible();
});

test('Ready rows offer Move to Waiting, not Hide until, and it opens the Hide until picker', async ({ page }) => {
  const watch = row(page, 'Buy new watch band');
  await watch.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Move to Waiting' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Hide until' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await watch.hover();
  await expect(watch.getByRole('button', { name: 'Hide until' })).toHaveCount(0);
  await watch.getByRole('button', { name: 'Move to Waiting' }).click();
  const pane = page.locator('[data-slot=wait-pane]');
  await expect(pane.locator('[data-slot=dialog-title]')).toHaveText('Hide until');
  await expect(pane.locator('[data-preset=noDate]')).toHaveAttribute('data-default', 'true');
  await pane.locator('[data-preset=noDate]').click();
  await expect(section(page, 'waiting').getByText('Buy new watch band')).toBeVisible();
  await expect.poll(() => showTask('Buy new watch band').task).toMatchObject({ status: 'waiting', startDate: null });
});

test('the flag item says Remove flag when the task is flagged, and Flag when it is not', async ({ page }) => {
  const passport = row(page, 'Renew passport');
  await passport.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Remove flag', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Unflag' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Remove flag', exact: true }).click();
  await expect.poll(() => showTask('Renew passport').task.flagged).toBe(false);
  await passport.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Flag', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('the board menu offers View recently deleted, with no icon, and it opens Recently deleted', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const item = page.getByRole('menuitem', { name: 'View recently deleted', exact: true });
  await expect(item).toBeVisible();
  await expect(item.locator('svg')).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Recently deleted', exact: true })).toHaveCount(0);
  await item.click();
  await expect(page.getByRole('heading', { name: 'Recently deleted' })).toBeVisible();
});

const background = (r: Locator) => r.evaluate((el) => getComputedStyle(el).backgroundColor);

test('the row with an open context menu is highlighted in every section, and clears when it closes', async ({ page }) => {
  const sections = await page.locator('[data-section]').evaluateAll((els) => els.map((el) => el.getAttribute('data-section')!));
  let checked = 0;
  for (const id of sections) {
    const target = section(page, id).locator('[data-slot=task-row]:visible').first();
    if ((await target.count()) === 0) continue;
    checked++;
    const other = section(page, id).locator('[data-slot=task-row]:visible').nth(1);
    const resting = await background(target);
    await target.click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
    await expect.poll(() => background(target)).not.toBe(resting);
    if ((await other.count()) > 0) expect(await background(other)).toBe(resting);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect.poll(() => background(target)).toBe(resting);
  }
  expect(checked).toBeGreaterThanOrEqual(3);
});

test('the context menu highlight matches the selected row and leaves its selection alone', async ({ page }) => {
  const watch = row(page, 'Buy new watch band');
  const resting = await background(watch);
  await watch.click();
  await expect(watch).toHaveAttribute('data-selected', 'true');
  const selected = await background(watch);
  expect(selected).not.toBe(resting);
  await watch.click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  expect(await background(watch)).toBe(selected);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(watch).toHaveAttribute('data-selected', 'true');
  expect(await background(watch)).toBe(selected);
});

test('Waiting row buttons show what they do', async ({ page }) => {
  const plumber = row(page, 'Plumber quote for kitchen sink');
  const tip = page.locator('[data-slot=tooltip-content][data-open]');
  await plumber.hover();
  await plumber.getByRole('button', { name: 'Hide until' }).hover();
  await expect(tip).toHaveText('Hide until later');
  await plumber.getByRole('button', { name: 'Hide until' }).click();
  await expect(page.locator('[data-slot=preset-panel]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-slot=preset-panel]')).toHaveCount(0);
  await plumber.getByRole('button', { name: 'Move to In Progress' }).hover();
  await expect(tip).toHaveText('Move to In Progress');
});

test('Move to In Progress on a Waiting task', async ({ page }) => {
  await row(page, 'Plumber quote for kitchen sink').hover();
  await row(page, 'Plumber quote for kitchen sink').getByRole('button', { name: 'Move to In Progress' }).click();
  await expect(section(page, 'in_progress').getByText('Plumber quote for kitchen sink')).toBeVisible();
  expect(showTask('Plumber quote for kitchen sink').task.status).toBe('in_progress');
});

for (const { title, later, hideUntil } of [
  { title: 'Contractor sign-off on deck permit', later: false, hideUntil: '2026-11-25' },
  { title: 'Warranty replacement for headphones', later: true, hideUntil: '2026-11-21' },
]) {
  test(`Move to In Progress on a Waiting task hidden until ${hideUntil} never asks and clears the date`, async ({ page }) => {
    expect(showTask(title).task).toMatchObject({ status: 'waiting', hideUntil });
    if (later) await section(page, 'waiting').getByText(/hidden until later/).click();
    await row(page, title).hover();
    await row(page, title).getByRole('button', { name: 'Move to In Progress' }).click();
    await expect(section(page, 'in_progress').getByText(title)).toBeVisible();
    await expect.poll(() => showTask(title).task).toMatchObject({ status: 'in_progress', hideUntil: null, startDate: null });
    await expect(page.locator('[data-slot=start-decision-prompt]')).toHaveCount(0);
  });
}

test('dragging a hidden-until Waiting task to Ready lands it in Ready with no question', async ({ page }) => {
  const title = 'Warranty replacement for headphones';
  await section(page, 'waiting').getByText(/hidden until later/).click();
  await drag(page, title, { section: 'ready' });
  await expect.poll(() => showTask(title)).toMatchObject({ placement: 'ready', task: { status: 'open', hideUntil: null, startDate: null } });
  await expect(page.locator('[data-slot=start-decision-prompt]')).toHaveCount(0);
});

/** Fully on screen. Quick actions at rest are visually hidden but still in the tab order. */
const shown = (l: Locator) => expect(l).toBeInViewport({ ratio: 1 });
const notShown = (l: Locator) => expect(l).not.toBeInViewport({ ratio: 1 });

test('row quick actions show on hover, just left of the dates and flag, in every section', async ({ page }) => {
  for (const { title, last, meta, isDate } of [
    { title: 'Twitter litigation claim', last: /^Due Nov 28$/, meta: 'Nov 28', isDate: true },
    { title: 'Reimbursement for conference travel', last: /^Due Mon$/, meta: 'Mon', isDate: true },
    { title: 'Renew passport', last: /^Due Nov 15$/, meta: 'Nov 15', isDate: true },
  ]) {
    const target = row(page, title);
    const button = target.getByRole('button', { name: last, exact: typeof last === 'string' });
    await page.mouse.move(0, 0);
    await target.hover();
    await shown(button);
    const b = (await button.boundingBox())!;
    const m = (await target.getByText(meta, { exact: true }).boundingBox())!;
    // A set due date is the last button, with the date inside it; other rows' buttons end before the date.
    if (isDate) expect(b.x + b.width).toBeGreaterThanOrEqual(m.x + m.width);
    else expect(b.x + b.width).toBeLessThan(m.x);
  }

  const plumber = row(page, 'Plumber quote for kitchen sink');
  await plumber.hover();
  const r = (await plumber.boundingBox())!;
  const b = (await plumber.getByRole('button', { name: 'Due', exact: true }).boundingBox())!;
  // With no dates or flag the Due button ends where the row does, or where its tag chips begin.
  const chips = await plumber.locator('[data-slot=trailing-meta]').boundingBox();
  expect((chips?.x ?? r.x + r.width) - (b.x + b.width)).toBeLessThan(20);
});

test('quick actions run Delete, state, then date, so the date button is at the right', async ({ page }) => {
  const x = async (l: Locator) => (await l.boundingBox())!.x;
  const dateButton = (title: string, name: string | RegExp) => row(page, title).getByRole('button', { name, exact: typeof name === 'string' });

  // A task with a due date: the date is the button that edits it, after the other quick actions.
  const passport = row(page, 'Renew passport');
  await passport.hover();
  const del = await x(passport.getByRole('button', { name: 'Delete', exact: true }));
  const later = await x(passport.getByRole('button', { name: 'Move to Waiting', exact: true }));
  const due = await x(dateButton('Renew passport', /^Due Nov 15$/));
  expect(del).toBeLessThan(later);
  expect(later).toBeLessThan(due);
  await expect(passport.getByRole('button', { name: 'Due', exact: true })).toHaveCount(0);

  // Without a due date the Due icon button takes the same place.
  const watchBand = row(page, 'Buy new watch band');
  await watchBand.hover();
  const delNone = await x(watchBand.getByRole('button', { name: 'Delete', exact: true }));
  const laterNone = await x(watchBand.getByRole('button', { name: 'Move to Waiting', exact: true }));
  const dueNone = await x(watchBand.getByRole('button', { name: 'Due', exact: true }));
  expect(delNone).toBeLessThan(laterNone);
  expect(laterNone).toBeLessThan(dueNone);
});

test('every open row ends with the Due button: Waiting, hidden until later and Upcoming too; Completed rows have none', async ({ page }) => {
  const due = (title: string) => row(page, title).getByRole('button', { name: /^Due( |$)/ });
  const x = async (l: Locator) => (await l.boundingBox())!.x;

  // Waiting, with and without a due date: after Hide until and Move to In Progress.
  for (const [title, label] of [
    ['Plumber quote for kitchen sink', 'Due'],
    ['Reimbursement for conference travel', 'Due Mon'],
  ] as const) {
    await row(page, title).hover();
    const button = row(page, title).getByRole('button', { name: label, exact: true });
    await expect(button).toBeVisible();
    expect(await x(row(page, title).getByRole('button', { name: 'Move to In Progress', exact: true }))).toBeLessThan(await x(button));
  }
  await expect(row(page, 'Reimbursement for conference travel').getByText('Mon')).toHaveCount(1);

  // Hidden until later: Hide until (its own date group), then Due.
  await section(page, 'waiting').getByRole('button', { name: /hidden until later/ }).click();
  const later = section(page, 'waiting').locator('[data-later] [data-slot=task-row]').first();
  await later.hover();
  expect(await x(later.getByRole('button', { name: 'Hide until', exact: true }))).toBeLessThan(await x(later.getByRole('button', { name: /^Due( |$)/ })));

  // Upcoming: Start, then Due.
  await section(page, 'upcoming').getByRole('button', { name: /^Upcoming/ }).click();
  const upcoming = row(page, 'Winterize the sprinkler system');
  await upcoming.hover();
  expect(await x(upcoming.getByRole('button', { name: 'Start', exact: true }))).toBeLessThan(await x(upcoming.getByRole('button', { name: /^Due( |$)/ })));
  await upcoming.getByRole('button', { name: /^Due( |$)/ }).click();
  await expect(page.locator('[data-slot=preset-panel]')).toBeVisible();
  await page.locator('[data-preset=tomorrow]').click();
  await expect.poll(() => showTask('Winterize the sprinkler system').task.dueDate).toBe('2026-11-19');

  // Completed rows keep a plain label, with a grey icon.
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Show completed' }).click();
  await page.keyboard.press('Escape');
  await section(page, 'completed').getByRole('button', { name: /^Completed/ }).click();
  const done = row(page, 'Pay November credit card bill');
  await done.hover();
  await expect(due('Pay November credit card bill')).toHaveCount(0);
  const grey = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'text-muted-foreground';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(await done.locator('[data-slot=due-label]').evaluate((el) => getComputedStyle(el).color)).toBe(grey);
  expect(await done.locator('[data-slot=trailing-meta] svg').first().evaluate((el) => getComputedStyle(el).color)).toBe(grey);
  await expect(done.locator('[data-slot=due-label]')).toHaveCSS('text-decoration-line', 'line-through');
});

test('the due date label is the button that edits the due date, and clicking anywhere on it opens the picks', async ({ page }) => {
  const passport = row(page, 'Renew passport');
  await passport.hover();
  const button = passport.getByRole('button', { name: 'Due Nov 15', exact: true });
  // Clicking the date text itself, not the icon, opens the same Due picks without opening the task.
  await button.getByText('Nov 15').click();
  await expect(page.locator('[data-slot=preset-panel]')).toBeVisible();
  await expect(page.locator('[data-preset=clear]')).toHaveText('No due date');
  await expect(passport).not.toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-slot=task-pane]')).toHaveCount(0);
  await page.locator('[data-preset=tomorrow]').click();
  await expect.poll(() => showTask('Renew passport').task.dueDate).toBe('2026-11-19');
  await expect(passport.getByRole('button', { name: 'Due Tomorrow', exact: true })).toBeVisible();
  await expect(page.locator('[data-slot=task-pane]')).toHaveCount(0);

  // The icon matches the quick-action icons' size and the Due action's orange.
  const icon = passport.getByRole('button', { name: 'Due Tomorrow', exact: true }).locator('svg');
  const box = (await icon.boundingBox())!;
  const quick = (await passport.getByRole('button', { name: 'Delete', exact: true }).locator('svg').boundingBox())!;
  expect(box.width).toBe(quick.width);
  const orange = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'text-flag';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(await icon.evaluate((el) => getComputedStyle(el).color)).toBe(orange);
});

test('keyboard focus shows a row\'s quick actions and Tab reaches them', async ({ page }) => {
  const passport = row(page, 'Renew passport');
  const del = passport.getByRole('button', { name: 'Delete', exact: true });
  const due = passport.getByRole('button', { name: /^Due Nov 15$/ });
  await page.mouse.move(0, 0);
  await notShown(del);
  await shown(due);
  await passport.getByRole('button', { name: /^Renew passport/ }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(passport.getByRole('checkbox')).toBeFocused();
  await shown(del);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(del).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(passport.getByRole('button', { name: 'Move to Waiting' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(due).toBeFocused();
  await shown(due);
  await page.keyboard.press('Tab');
  await notShown(del);
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
      expect(showTask(title)).toMatchObject({ placement: 'waiting', task: { status: 'waiting', dueDate: TODAY, hideUntil: '2026-11-25', startDate: null } });
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

test('row titles edit in place: Enter and blur save, Escape cancels', async ({ page }) => {
  const title = row(page, 'Fix squeaky closet door').getByRole('textbox', { name: 'Title' });
  await title.click();
  await expect(title).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(' hinge');
  await page.keyboard.press('Enter');
  await expect(title).not.toBeFocused();
  await expect.poll(() => showTask('Fix squeaky closet door hinge').task.title).toBe('Fix squeaky closet door hinge');

  await title.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' now');
  await page.keyboard.press('Escape');
  await expect(title).toHaveText('Fix squeaky closet door hinge');
  expect(showTask('Fix squeaky closet door hinge').task.title).toBe('Fix squeaky closet door hinge');

  await title.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Oil the closet hinges');
  await row(page, 'Buy new watch band').getByRole('textbox', { name: 'Title' }).click();
  await expect.poll(() => findTask('Oil the closet hinges')?.task.title).toBe('Oil the closet hinges');
  expect(findTask('Fix squeaky closet door')).toBeNull();

  await row(page, 'Oil the closet hinges').click();
  await expect(page.locator('[data-slot=task-editor]').getByRole('textbox', { name: 'Title' })).toHaveValue('Oil the closet hinges');
});

const pane = (page: Page) => page.locator('[data-slot=task-pane]');
const editorTitle = (page: Page) => page.locator('[data-slot=task-editor]').getByRole('textbox', { name: 'Title' });

test('no detail pane shows until a task is selected, and its room stays reserved', async ({ page }) => {
  await expect(pane(page)).toHaveCount(0);
  await expect(page.getByText('Select a task to see its details')).toHaveCount(0);
  const main = (await page.locator('main').boundingBox())!;
  // Centered in the window minus the 400px the pane will take, not in the whole window.
  expect(main.x + main.width / 2).toBeCloseTo(440, -1);
});

test('clicking a title selects the row, loads the pane and leaves the title ready to edit', async ({ page }) => {
  const title = row(page, 'Fix squeaky closet door').getByRole('textbox', { name: 'Title' });
  await title.click();
  const { task } = showTask('Fix squeaky closet door');
  await expect(row(page, 'Fix squeaky closet door')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator(`[data-slot=task-editor][data-task-id="${task.id}"]`)).toBeVisible();
  await expect(title).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(' hinge');
  await page.keyboard.press('Enter');
  await expect.poll(() => findTask('Fix squeaky closet door hinge')?.task.title).toBe('Fix squeaky closet door hinge');
  await expect(editorTitle(page)).toHaveValue('Fix squeaky closet door hinge');

  await row(page, 'Buy new watch band').getByRole('textbox', { name: 'Title' }).click();
  const other = showTask('Buy new watch band').task;
  await expect(page.locator(`[data-slot=task-editor][data-task-id="${other.id}"]`)).toBeVisible();
  await expect(page.locator('[data-slot=task-row][data-selected]')).toHaveCount(1);
  await expect(row(page, 'Buy new watch band')).toHaveAttribute('data-selected', 'true');
  await expect(row(page, 'Buy new watch band').getByRole('textbox', { name: 'Title' })).toBeFocused();
});

test('clicking off the list closes the pane and clears the selection', async ({ page }) => {
  await row(page, 'Fix squeaky closet door').getByRole('textbox', { name: 'Title' }).click();
  await expect(pane(page)).toBeVisible();
  await settled(page);

  // Inside the pane, on a popover, and on a row's own controls keep the selection.
  await page.locator('[data-slot=task-editor]').getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await row(page, 'Buy new watch band').hover();
  await expect(pane(page)).toBeVisible();

  await page.mouse.click(40, 400);
  await expect(page.locator('[data-slot=task-row][data-selected]')).toHaveCount(0);
  await expect(pane(page)).toHaveCount(0);
  const main = (await page.locator('main').boundingBox())!;
  expect(main.x + main.width / 2).toBeCloseTo(440, -1);
});

test('the pane slides in and out, keeping the last task while it leaves', async ({ page }) => {
  await row(page, 'Fix squeaky closet door').click();
  const widths = await page.evaluate(async () => {
    const el = document.querySelector('[data-slot=task-pane]')!;
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      seen.push(el.getBoundingClientRect().width);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return seen;
  });
  expect(widths[widths.length - 1]).toBe(400);
  expect(widths.some((w) => w > 0 && w < 400)).toBe(true);

  await settled(page);
  // Sample the slide from the click. A later snapshot can miss the 200ms leave on a slow runner.
  const closing = page.evaluate(
    () =>
      new Promise<{ widths: number[]; titles: string[] }>((resolve) => {
        const widths: number[] = [];
        const titles: string[] = [];
        let frames = 0;
        const step = () => {
          const el = document.querySelector('[data-slot=task-pane]');
          widths.push(el ? el.getBoundingClientRect().width : -1);
          const title = el?.querySelector('[aria-label="Title"]');
          titles.push(title instanceof HTMLInputElement || title instanceof HTMLTextAreaElement ? title.value : '');
          frames += 1;
          if (frames < 40) requestAnimationFrame(step);
          else resolve({ widths, titles });
        };
        requestAnimationFrame(step);
      }),
  );
  await pane(page).getByRole('button', { name: 'Close' }).click();
  const { widths: closingWidths, titles } = await closing;
  expect(closingWidths.some((width, i) => width > 0 && width < 400 && titles[i] === 'Fix squeaky closet door')).toBe(true);
  await expect(row(page, 'Fix squeaky closet door')).not.toHaveAttribute('data-selected');
  await expect(pane(page)).toHaveCount(0);
});

test('the pane snaps in and out with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await row(page, 'Fix squeaky closet door').click();
  await expect(pane(page)).toBeVisible();
  expect(await pane(page).evaluate((el) => el.getBoundingClientRect().width)).toBe(400);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.mouse.click(40, 400);
  await expect(pane(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('below 1024px titles do not edit in place and a click opens the overlay sheet', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 860 });
  await expect(row(page, 'Fix squeaky closet door').getByRole('textbox', { name: 'Title' })).toHaveCount(0);
  await row(page, 'Fix squeaky closet door').getByText('Fix squeaky closet door').click();
  await expect(page.locator('[data-slot=sheet-content] [data-slot=task-editor]')).toBeVisible();
  await expect(pane(page)).toHaveCount(0);
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
  await page.getByRole('menuitem', { name: 'View recently deleted' }).click();
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

test('offline: read-only with a banner, and every row action is disabled', async ({ page, context }) => {
  await context.setOffline(true);
  await expect(page.locator('[data-slot=offline-banner]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add task' })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Complete Buy new watch band' })).toBeDisabled();
  await expect(page.getByText("You're offline. Changes are paused until you're back online.")).toHaveCount(0);

  // Quick actions on a Ready row, on a row with a due date, and on a Waiting row.
  for (const [title, names] of [
    ['Buy new watch band', ['Delete', 'Move to Waiting', 'Due']],
    ['Renew passport', ['Delete', 'Move to Waiting', /^Due Nov 15$/]],
    ['Plumber quote for kitchen sink', ['Hide until', 'Move to In Progress', 'Due']],
  ] as const) {
    await row(page, title).hover();
    for (const name of names) await expect(row(page, title).getByRole('button', { name, exact: typeof name === 'string' })).toBeDisabled();
  }

  // The right-click menu opens, but every item is off.
  await row(page, 'Renew passport').click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  const items = page.getByRole('menuitem');
  const count = await items.count();
  expect(count).toBeGreaterThan(3);
  for (let i = 0; i < count; i++) await expect(items.nth(i)).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  // The sheet shows the task but can't change it.
  await row(page, 'Renew passport').click();
  const editor = page.locator('[data-slot=task-editor]');
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('checkbox', { name: 'Complete' })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Flag' })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'More' })).toBeDisabled();
  await expect(editor.locator('[data-field=Due]')).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Add file' })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Add photo' })).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.locator('[data-slot=offline-banner]')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Complete Buy new watch band' })).toBeEnabled();
  expect(showTask('Buy new watch band').task.completedAt).toBeNull();
});

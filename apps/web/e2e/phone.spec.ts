import { expect, test, type Locator, type Page } from '@playwright/test';
import { captureSheetFrame } from '../src/components/board/capture-sheet-frame';
import { sheetFillsScreen } from '../src/components/board/task-sheet-frame';
import { dictationProbe, installDictation, speak } from './dictation-fake';
import { cliJson, findTask, openBoard, recordDrop, reseed, row, section, showTask, tagNames, titlesIn, TODAY } from './helpers';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

test('tapping a row opens the bottom sheet', async ({ page }) => {
  await row(page, 'Buy new watch band').getByText('Buy new watch band').tap();
  await expect(page.locator('[data-slot=drawer-content] [data-slot=task-editor]')).toBeVisible();
});

test('a task sheet taller than 75% of the screen fills it, and a shorter one stays a sheet', async ({ page }) => {
  expect(sheetFillsScreen(751, 1000)).toBe(true);
  expect(sheetFillsScreen(750, 1000)).toBe(false);

  // The device viewport includes browser chrome. The home screen is the full phone.
  await page.setViewportSize({ width: 393, height: 852 });
  const popup = page.locator('[data-slot=drawer-popup]');

  await row(page, 'Fix squeaky closet door').getByText('Fix squeaky closet door').tap();
  await expect(popup).toHaveAttribute('data-fill', 'sheet');
  await expect.poll(async () => (await popup.boundingBox())!.height).toBeLessThan(852 * 0.75);
  await expect(popup.getByRole('button', { name: 'Close' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);

  await row(page, 'Finance quarterly action items').getByText('Finance quarterly action items').tap();
  await expect(popup).toHaveAttribute('data-fill', 'full');
  await expect.poll(async () => (await popup.boundingBox())!.y).toBeLessThan(8);
  await expect.poll(async () => (await popup.boundingBox())!.height).toBeGreaterThan(840);
  await expect(popup.getByRole('button', { name: 'Close' })).toBeVisible();
});

test('the capture sheet keeps the note below the status bar', async ({ page }) => {
  // iOS leaves the layout viewport full height, shrinks the visual viewport, and pans it.
  // The sheet has to sit in that visible band, below the status bar and above the keyboard.
  const panned = captureSheetFrame(852, 500, 180, 59);
  expect(panned).not.toBeNull();
  expect(panned!.top).toBeGreaterThanOrEqual(180 + 59);
  expect(panned!.top + panned!.height).toBeLessThanOrEqual(180 + 500);
  expect(panned!.height).toBeGreaterThan(300);
  expect(captureSheetFrame(852, 852, 0, 59)).toBeNull();

  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, left: 0, bottom: 34, right: 0 } });
  // Home Screen: the full iPhone height, with no browser chrome.
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole('button', { name: 'Capture' }).tap();
  const dialog = page.getByRole('dialog', { name: 'Capture' });
  const note = dialog.getByRole('textbox', { name: 'Note' });
  const helper = dialog.getByText('Done sends this note to be read. Nothing is saved until you confirm.');
  const done = dialog.getByRole('button', { name: 'Done' });
  const box = async (target: Locator) => (await target.boundingBox())!;

  // Keyboard closed: still the 85dvh sheet, and the note clears the status bar.
  await expect.poll(async () => (await box(dialog)).y).toBeLessThan(180);
  const resting = await box(dialog);
  expect(resting.y).toBeGreaterThan(100);
  expect((await box(note)).y).toBeGreaterThanOrEqual(59);

  // Keyboard open. The safe area is taller than the drawer's old 6rem gap, which is what
  // let the note slide under the status bar.
  const safeTop = 100;
  await client.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: safeTop, left: 0, bottom: 34, right: 0 } });
  await page.setViewportSize({ width: 393, height: 500 });
  const height = page.viewportSize()!.height;
  await expect.poll(async () => Math.round((await box(dialog)).y)).toBeGreaterThanOrEqual(safeTop - 1);
  const noteBox = await box(note);
  const helperBox = await box(helper);
  const doneBox = await box(done);
  expect(noteBox.y).toBeGreaterThanOrEqual(safeTop - 1);
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(helperBox.y + 1);
  expect(helperBox.y + helperBox.height).toBeLessThanOrEqual(doneBox.y + 1);
  expect(doneBox.y + doneBox.height).toBeLessThanOrEqual(height + 1);
});

test('Capture sits beside Add and saves a reviewed task', async ({ page }) => {
  await page.goto(`/?today=${TODAY}&capture=replay`);
  await expect(page.locator('[data-section=ready] [data-slot=task-row]').first()).toBeVisible();
  const add = (await page.getByRole('button', { name: 'Add task' }).boundingBox())!;
  const capture = (await page.getByRole('button', { name: 'Capture' }).boundingBox())!;
  expect(capture.x).toBeLessThan(add.x);
  expect(Math.abs(capture.y - add.y)).toBeLessThan(2);
  await page.getByRole('button', { name: 'Capture' }).tap();
  const dialog = page.getByRole('dialog', { name: 'Capture' });
  await dialog.getByRole('textbox', { name: 'Note' }).fill('Add a task to pick up my dry cleaning on Friday');
  await dialog.getByRole('button', { name: 'Done' }).tap();
  await expect(dialog.locator('[data-slot=capture-card-title]')).toHaveText('Pick up dry cleaning');
  await dialog.getByRole('button', { name: 'Add task' }).tap();
  await expect.poll(async () => (await titlesIn(page, 'ready'))[0]).toBe('Pick up dry cleaning');
});

test('phone Capture only opens the sheet, and Dictate writes the note', async ({ page }) => {
  await installDictation(page, 'ok');
  await page.goto(`/?today=${TODAY}&capture=replay`);
  await expect(page.locator('[data-section=ready] [data-slot=task-row]').first()).toBeVisible();
  expect((await dictationProbe(page)).starts).toBe(0);
  await page.getByRole('button', { name: 'Capture' }).tap();
  const dialog = page.getByRole('dialog', { name: 'Capture' });
  expect((await dictationProbe(page)).starts).toBe(0);
  const footer = dialog.locator('[data-slot=capture-footer]');
  await expect(footer.getByRole('button', { name: 'Dictate', exact: true })).toHaveCount(0);
  await expect(footer.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Done' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Dictate', exact: true }).tap();
  await speak(page, [{ final: true, text: 'buy milk' }]);
  await expect(dialog.getByRole('textbox', { name: 'Note' })).toHaveValue('buy milk');
  await expect(dialog.getByRole('textbox', { name: 'Note' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel' }).tap();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await dictationProbe(page)).aborts).toBeGreaterThan(0);
});

test('the floating Add task button quick-adds from anywhere on the board', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Add task' })).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole('button', { name: 'Add task' }).tap();
  await expect(page.getByRole('textbox', { name: 'New task' })).toBeInViewport();
  await page.getByRole('textbox', { name: 'New task' }).fill('Book flu shots for the family');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await titlesIn(page, 'ready'))[0]).toBe('Book flu shots for the family');
  await expect.poll(() => findTask('Book flu shots for the family')?.placement).toBe('ready');
});

test('scrolled to the bottom, the floating button leaves the last row tappable', async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const upcoming = page.locator('[data-section=upcoming]').getByRole('button', { name: /Upcoming/ });
  const box = (await upcoming.boundingBox())!;
  // A raw tap at the row's right end, where the button floats. Locator taps would scroll the row clear first.
  await page.touchscreen.tap(box.x + box.width - 8, box.y + box.height / 2);
  await expect(page.locator('[data-section=upcoming] [data-slot=task-row]').first()).toBeVisible();
});

async function swipeLeft(page: Page, title: string) {
  const target = row(page, title);
  const box = (await target.boundingBox())!;
  const y = box.y + box.height / 2;
  const pointer = (type: 'pointerdown' | 'pointermove' | 'pointerup', x: number) =>
    target.dispatchEvent(type, { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: x, clientY: y, bubbles: true });
  await pointer('pointerdown', box.x + box.width - 20);
  for (let x = box.x + box.width - 40; x > box.x + 60; x -= 30) await pointer('pointermove', x);
  await pointer('pointerup', box.x + 60);
  const open = page.locator('[data-slot=swipe-row][data-open=left]');
  await expect(open).toBeVisible();
  return open.locator('[data-slot=swipe-tray][data-reveal=left]');
}

test('swipe left shows the row buttons; Due opens the quick picks', async ({ page }) => {
  const tray = await swipeLeft(page, 'Return library books');
  await tray.getByRole('button', { name: 'Due', exact: true }).tap();
  await page.locator('[data-slot=preset-sheet] [data-preset=nextMonday]').tap();
  await expect.poll(() => showTask('Return library books').task.dueDate).toBe('2026-11-23');
});

test('the swipe buttons run in the desktop order: Delete, state, date, then Due', async ({ page }) => {
  const names = async (tray: Locator) => tray.locator('button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(await names(await swipeLeft(page, 'Return library books'))).toEqual(['Delete', 'Move to Waiting', 'Due']);
  await page.reload();
  expect(await names(await swipeLeft(page, 'Plumber quote for kitchen sink'))).toEqual(['Delete', 'Hide until', 'Move to In Progress', 'Due']);
});

test('offline, the swipe buttons and file buttons are disabled', async ({ page, context }) => {
  await context.setOffline(true);
  await expect(page.locator('[data-slot=offline-banner]')).toBeVisible();
  const tray = await swipeLeft(page, 'Return library books');
  const buttons = tray.locator('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(2);
  for (let i = 0; i < count; i++) await expect(buttons.nth(i)).toBeDisabled();
  await row(page, 'Buy new watch band').getByText('Buy new watch band').tap();
  const files = page.locator('[data-slot=drawer-content] [data-slot=files]');
  await expect(files.getByRole('button', { name: 'Add file' })).toBeDisabled();
  await expect(files.getByRole('button', { name: 'Camera' })).toHaveCount(0);
  await expect(files.getByRole('button', { name: 'Photo library' })).toHaveCount(0);
  await context.setOffline(false);
});

test('sections bleed to the screen edges, and section titles line up with task titles', async ({ page }) => {
  const width = page.viewportSize()!.width;
  const card = (await section(page, 'ready').locator('[data-drop-target] > div').boundingBox())!;
  expect(card.x).toBe(0);
  expect(card.width).toBe(width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

  const taskTitle = (await section(page, 'ready').locator('[data-slot=task-title]').first().boundingBox())!.x;
  const expanded = (await section(page, 'ready').getByText('Ready', { exact: true }).boundingBox())!.x;
  const collapsed = (await section(page, 'upcoming').getByText('Upcoming', { exact: true }).boundingBox())!.x;
  expect(expanded).toBeCloseTo(taskTitle, 0);
  expect(collapsed).toBeCloseTo(taskTitle, 0);
});

test('rows leave quick actions to the swipe buttons, so the title has the room', async ({ page }) => {
  for (const title of ['Twitter litigation claim', 'Plumber quote for kitchen sink', 'Renew passport']) {
    const buttons = row(page, title).locator('button:not([data-slot=drag-handle])');
    await expect(buttons).toHaveCount(1);
    await expect(buttons).toHaveAccessibleName(new RegExp(`^${title}`));
  }
});

test('pressing and holding the handle drags, and the overlay settles into the new position', async ({ page }) => {
  const title = 'Draft holiday card list';
  const before = await titlesIn(page, 'in_progress');
  expect(before[2]).toBe(title);
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const grip = (await row(page, title).getByRole('button', { name: /^Reorder/ }).boundingBox())!;
  const first = (await row(page, before[0]!).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await touch('touchStart', x, y);
  await page.waitForTimeout(450);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', x, y + ((first.y + 4 - y) * i) / 12);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(150);
  const recording = await recordDrop(page, title);
  await touch('touchEnd', x, first.y + 4);
  await expect.poll(() => titlesIn(page, 'in_progress')).toEqual([title, before[0], before[1]]);
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const frames = await recording.stop();
  const landed = (await row(page, title).boundingBox())!.y;
  const overlay = frames.map((f) => f.overlay).filter((o): o is number => o !== null);
  expect(overlay.length).toBeGreaterThan(0);
  expect(Math.max(...overlay)).toBeLessThanOrEqual(landed + 20);
  expect(Math.abs(overlay[overlay.length - 1]! - landed)).toBeLessThanOrEqual(4);
});

test('with no hover the drag handle stays visible, and keeps its column', async ({ page }) => {
  const grip = row(page, 'Draft holiday card list').getByRole('button', { name: /^Reorder/ });
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
  expect(await grip.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
  expect((await grip.boundingBox())!.width).toBeGreaterThan(0);
});

test('checking off a task holds it struck through, then folds it away; the check mark fills the circle in Completed', async ({ page }) => {
  const circle = row(page, 'Buy new watch band').getByRole('checkbox');
  const size = (await circle.boundingBox())!.width;
  await circle.tap();
  const held = page.locator('[data-ghost=done]', { hasText: 'Buy new watch band' });
  await expect(held).toHaveCount(1);
  await expect(held.locator('[data-slot=task-title]')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(held).toHaveCount(0);
  await expect.poll(() => showTask('Buy new watch band').task.completedAt).not.toBeNull();

  await page.getByRole('button', { name: 'Menu', exact: true }).tap();
  await page.getByRole('menuitemcheckbox', { name: 'Show completed' }).tap();
  await page.keyboard.press('Escape');
  await section(page, 'completed').getByRole('button', { name: /^Completed/ }).tap();
  const done = section(page, 'completed').getByRole('checkbox', { name: 'Complete Buy new watch band' });
  await expect(done).toBeVisible();
  const { c, k } = await done.evaluate((el) => {
    const rect = (e: Element) => e.getBoundingClientRect();
    return { c: rect(el), k: rect(el.querySelector('svg')!) };
  });
  expect(c.width).toBe(size);
  expect(k.width / c.width).toBeGreaterThan(0.55);
  expect(k.width / c.width).toBeLessThan(0.8);
});

test('subtasks in the bottom sheet: the grip is always shown, tick and add work, and the row shows the count', async ({ page }) => {
  const title = 'Order replacement dishwasher rack wheels';
  await row(page, title).getByText(title).tap();
  const sheet = page.locator('[data-slot=drawer-content] [data-slot=subtasks-card]');
  await expect(sheet.locator('[data-slot=subtasks-progress]')).toHaveText('0 of 2');
  await expect(sheet.getByRole('button', { name: /^Reorder/ }).first()).toHaveCSS('opacity', '1');
  await expect(sheet.getByRole('button', { name: /^Delete / })).toHaveCount(0);

  await sheet.getByRole('checkbox', { name: 'Find model number' }).tap();
  await expect(sheet.locator('[data-slot=subtasks-progress]')).toHaveText('1 of 2');
  await expect.poll(() => showTask(title).subtaskCount).toEqual({ done: 1, total: 2 });
  await expect(row(page, title).locator('[data-slot=subtask-count]')).toContainText('1/2');

  await sheet.getByRole('button', { name: 'Add subtask' }).tap();
  await page.keyboard.type('Measure the old wheel');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(sheet.locator('[data-slot=subtasks-progress]')).toHaveText('1 of 3');
  await expect.poll(() => showTask(title).task.subtasks.map((s) => s.title)).toEqual(['Find model number', 'Order from parts site', 'Measure the old wheel']);

  // Clearing a title deletes it, which is how a touch screen deletes one.
  await sheet.locator('[data-slot=subtask-title]', { hasText: 'Measure the old wheel' }).tap();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect.poll(() => showTask(title).subtaskCount).toEqual({ done: 1, total: 2 });
});

test('phone rows show no tag chips, the sheet lists them, and the picker is a bottom sheet', async ({ page }) => {
  const title = 'Finance quarterly action items';
  await expect(row(page, title)).toBeVisible();
  await expect(page.locator('[data-slot=task-row] [data-slot=tag-chip]:visible')).toHaveCount(0);

  await row(page, title).getByText(title).tap();
  const editor = page.locator('[data-slot=drawer-content] [data-slot=task-editor]');
  await expect(editor.locator('[data-field=Tags] [data-slot=tag-chip]')).toHaveText(tagNames(title));

  await editor.locator('[data-field=Tags]').tap();
  const sheet = page.locator('[data-slot=tag-sheet]');
  await expect(sheet.getByText('Tags', { exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Done' })).toBeVisible();
  await expect(sheet.locator('[data-slot=tag-count]')).toHaveCount(0);

  await sheet.getByRole('option', { name: 'work', exact: true }).tap();
  await expect.poll(() => tagNames(title)).toContain('work');
  await sheet.getByPlaceholder('Search or create tag').fill('garden');
  await sheet.locator('[data-slot=tag-create]').tap();
  await expect.poll(() => tagNames(title)).toContain('garden');

  await sheet.getByRole('button', { name: 'Done' }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(editor.locator('[data-field=Tags]')).toContainText('garden');
});

test('phone repeat: the row icon, a presets sheet, and custom in a bottom sheet', async ({ page }) => {
  await expect(row(page, 'Take out garbage').locator('[data-slot=repeat-icon]')).toBeVisible();

  const bare = 'Replace furnace filter';
  await row(page, bare).getByText(bare).tap();
  const editor = page.locator('[data-slot=task-editor]');
  await editor.locator('[data-field=Repeat]').tap();
  const sheet = page.locator('[data-slot=repeat-sheet]');
  await expect(sheet.getByText('Repeat', { exact: true })).toBeVisible();
  await expect(sheet.locator('[data-preset=daily]')).toBeVisible();
  await sheet.locator('[data-preset=daily]').tap();
  await expect.poll(() => showTask(bare).task.dueDate).toBe('2026-11-18');
  await sheet.getByRole('button', { name: 'Close' }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(editor.locator('[data-slot=repeat-value]')).toHaveText('Daily');

  await editor.locator('[data-field=Repeat]').tap();
  await sheet.locator('[data-preset=custom]').tap();
  const custom = page.locator('[data-slot=repeat-custom]');
  await expect(custom.getByText('Custom', { exact: true })).toBeVisible();
  await custom.getByRole('button', { name: 'Repeat', exact: true }).tap();
  await expect(sheet.locator('[data-preset=daily]')).toHaveAttribute('aria-pressed', 'true');
  await sheet.locator('[data-preset=custom]').tap();
  await custom.getByRole('button', { name: 'Frequency' }).tap();
  await page.getByRole('menuitemradio', { name: 'month', exact: true }).tap();
  await custom.locator('[data-monthly=last]').tap();
  await custom.getByRole('button', { name: 'Done' }).tap();
  await expect.poll(() => showTask(bare).task.repeat).toMatchObject({ freq: 'monthly', monthly: { day: -1 } });
  await expect(editor.locator('[data-slot=repeat-value]')).toHaveText('Monthly on the last day');
});

test('the completed log lists finishes, including a repeating one, and stays read-only', async ({ page }) => {
  await row(page, 'Water the plants').getByRole('checkbox').tap();
  await expect.poll(() => {
    const found = cliJson<{ weeks: { days: { entries: { title: string; source: string }[] }[] }[] }>('log');
    return found.weeks.some((week) => week.days.some((day) => day.entries.some((entry) => entry.title === 'Water the plants' && entry.source === 'occurrence')));
  }).toBe(true);

  await page.getByRole('button', { name: 'Menu', exact: true }).tap();
  await page.getByRole('menuitem', { name: 'Completed log', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Completed log' })).toBeVisible();
  const logRoot = page.locator('[data-slot=completed-log]');
  await expect(logRoot.locator('[data-slot=log-row]', { hasText: 'Water the plants' })).toBeVisible();
  await expect(logRoot.locator('[data-slot=log-row]', { hasText: 'Pick up dry cleaning' })).toBeVisible();
  await expect(logRoot.getByRole('checkbox')).toHaveCount(0);
  await expect(logRoot.getByRole('button', { name: /Reorder/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).tap();
  await expect(page.locator('[data-section=ready]')).toBeVisible();
});

test('history opens from the task sheet and returns to the task', async ({ page }) => {
  await row(page, 'Water the plants').getByText('Water the plants').tap();
  const editor = page.locator('[data-slot=drawer-content] [data-slot=task-editor]');
  await expect(editor.getByRole('button', { name: 'Skip this occurrence' })).toBeVisible();
  await expect(editor.locator('[data-slot=task-history]')).toHaveCount(0);
  await editor.getByRole('button', { name: 'More' }).tap();
  await page.getByRole('menuitem', { name: 'History' }).tap();
  await expect(editor.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(editor.getByText('No history.')).toBeVisible();
  await editor.getByRole('button', { name: 'Task' }).tap();
  await expect(editor.getByRole('textbox', { name: 'Title' })).toHaveValue('Water the plants');
  await expect(editor.locator('[data-slot=task-history]')).toHaveCount(0);
});

test('phone search: the Tags filter narrows results, and result rows show no chips', async ({ page }) => {
  await page.getByRole('button', { name: 'Search', exact: true }).tap();
  await page.getByRole('button', { name: 'Tags' }).tap();
  await page.locator('[data-slot=tags-menu]').getByRole('menuitemcheckbox', { name: /^finance/ }).tap();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-slot=command-item][data-task-id]').first()).toBeVisible();
  await expect(page.locator('[data-slot=command-item] [data-slot=tag-chip]:visible')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove tag finance' })).toBeVisible();
});

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('the task sheet has one Add file button', async ({ page }) => {
  await row(page, 'Buy new watch band').getByText('Buy new watch band').tap();
  const files = page.locator('[data-slot=drawer-content] [data-slot=files]');
  await expect(files.getByRole('button', { name: 'Add file' })).toHaveCount(1);
  await expect(files.getByRole('button', { name: 'Camera' })).toHaveCount(0);
  await expect(files.getByRole('button', { name: 'Photo library' })).toHaveCount(0);
  await expect(files.getByRole('button', { name: 'Add photo' })).toHaveCount(0);
  const input = files.locator('[data-slot=file-input]');
  await expect(input).toHaveCount(1);
  await expect(input).not.toHaveAttribute('accept');
  await expect(input).not.toHaveAttribute('capture');

  await input.setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: TINY_PNG });
  const fileRow = files.locator('[data-slot=file-row]');
  await expect(fileRow.locator('[data-slot=file-thumb]')).toBeVisible();
  await expect(row(page, 'Buy new watch band').locator('img')).toHaveCount(0);

  await fileRow.getByRole('button', { name: 'dot.png', exact: true }).tap();
  const preview = page.getByRole('dialog', { name: 'dot.png' });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Zoom in' })).toBeHidden();
  await expect(preview.getByRole('link', { name: 'Open original' })).toBeVisible();
  const stage = preview.locator('[data-slot=image-stage]');
  const box = await stage.boundingBox();
  if (!box) throw new Error('preview stage has no box');
  const session = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  const mid = box.x + box.width / 2;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: mid - 30, y, id: 1 },
      { x: mid + 30, y, id: 2 },
    ],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: box.x + 16, y, id: 1 },
      { x: box.x + box.width - 16, y, id: 2 },
    ],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => Number(await preview.locator('img').getAttribute('data-zoom'))).toBeGreaterThan(1);

  await preview.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(preview).toBeHidden();
  await expect(files).toBeVisible();

  await fileRow.getByRole('button', { name: 'Remove dot.png' }).tap();
  await expect(files.locator('[data-slot=file-row]')).toHaveCount(0);
});

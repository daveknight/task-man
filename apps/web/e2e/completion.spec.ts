import { expect, test, type Page } from '@playwright/test';
import { openBoard, reseed, row, section, showTask } from './helpers';

const TITLE = 'Buy new watch band';
const DONE_TITLE = 'Pick up dry cleaning';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

const ghost = (page: Page, title: string) => page.locator('[data-ghost]', { hasText: title });
const checkbox = (page: Page, title: string) => page.getByRole('checkbox', { name: `Complete ${title}` });

async function showCompleted(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Show completed' }).click();
  await page.keyboard.press('Escape');
  await section(page, 'completed').getByRole('button', { name: /^Completed/ }).click();
  await expect(section(page, 'completed').locator('[data-slot=task-row]').first()).toBeVisible();
}

/** Records when the browser sends writes to Supabase, to prove they don't wait for the animation. */
function watchWrites(page: Page) {
  const sent: number[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/rest/v1/')) sent.push(Date.now());
  });
  return sent;
}

test.describe('completing', () => {
  test('the title stays, struck through, for a moment, then the row folds away; the write is not held back', async ({ page }) => {
    const sent = watchWrites(page);
    const clicked = Date.now();
    await checkbox(page, TITLE).click();

    const held = ghost(page, TITLE);
    await expect(held).toHaveCount(1);
    await expect(held).toHaveAttribute('data-ghost', 'done');
    await expect(held.locator('[data-slot=task-title]')).toHaveCSS('text-decoration-line', 'line-through');
    await expect(held).not.toHaveAttribute('data-leaving', /.*/);

    // The fold lasts about 200ms, which the default polling can step over on a busy machine.
    await page.waitForFunction((title) => [...document.querySelectorAll('[data-ghost]')].some((g) => g.textContent?.includes(title) && g.getAttribute('data-leaving') === 'true'), TITLE, { polling: 'raf' });
    const folding = Date.now();
    await expect(held).toHaveCount(0);
    await expect(section(page, 'ready').getByText(TITLE)).toHaveCount(0);

    expect(folding - clicked).toBeGreaterThanOrEqual(400);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0]! - clicked).toBeLessThan(folding - clicked - 100);
    await expect.poll(() => showTask(TITLE).task.completedAt).not.toBeNull();
  });

  test('with Completed open, the row waits out the hold, then grows into the top of Completed', async ({ page }) => {
    await showCompleted(page);
    const inCompleted = section(page, 'completed').locator('[data-slot=task-row]', { hasText: TITLE });
    await checkbox(page, TITLE).click();

    // The hold is 500ms. Two separate expects can land after it on a busy runner, once the row is already in Completed.
    await page.waitForFunction(
      (title) => {
        const held = [...document.querySelectorAll('[data-ghost]')].find((el) => el.textContent?.includes(title));
        const arrived = [...document.querySelectorAll('[data-section=completed] [data-slot=task-row]')].some((el) => el.textContent?.includes(title));
        return held?.getAttribute('data-ghost') === 'done' && !arrived;
      },
      TITLE,
      { polling: 'raf' },
    );

    await expect(inCompleted).toHaveCount(1);
    await expect(ghost(page, TITLE)).toHaveCount(0);
    await expect(section(page, 'completed').locator('[data-slot=task-row]').first()).toContainText(TITLE);
    await expect(section(page, 'completed').getByRole('checkbox', { name: `Complete ${TITLE}` })).toBeChecked();
    await expect(section(page, 'completed').locator('[data-entering]')).toHaveCount(0);
  });

  test('un-completing reverses it: the row stays in Completed without its strikethrough, folds away and grows back into its section', async ({ page }) => {
    await showCompleted(page);
    const inReady = section(page, 'ready').locator('[data-slot=task-row]', { hasText: DONE_TITLE });
    await section(page, 'completed').getByRole('checkbox', { name: `Complete ${DONE_TITLE}` }).click();

    const held = ghost(page, DONE_TITLE);
    // Same window as the complete hold: sample it on animation frames so a busy runner doesn't miss it.
    await page.waitForFunction(
      (title) => {
        const row = [...document.querySelectorAll('[data-ghost]')].find((el) => el.textContent?.includes(title));
        const arrived = [...document.querySelectorAll('[data-section=ready] [data-slot=task-row]')].some((el) => el.textContent?.includes(title));
        const titleEl = row?.querySelector('[data-slot=task-title]');
        const decoration = titleEl ? getComputedStyle(titleEl).textDecorationLine : '';
        return row?.getAttribute('data-ghost') === 'undone' && !decoration.includes('line-through') && !arrived;
      },
      DONE_TITLE,
      { polling: 'raf' },
    );

    await expect(held).toHaveCount(0);
    await expect(inReady).toHaveCount(1);
    await expect(section(page, 'completed').getByText(DONE_TITLE)).toHaveCount(0);
    await expect.poll(() => showTask(DONE_TITLE).task.completedAt).toBeNull();
  });

  test('Undo in the toast brings the task back, and the data change is immediate', async ({ page }) => {
    await checkbox(page, TITLE).click();
    await expect.poll(() => showTask(TITLE).task.completedAt).not.toBeNull();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(row(page, TITLE)).toBeVisible();
    await expect(section(page, 'ready').getByText(TITLE)).toHaveCount(1);
    await expect.poll(() => showTask(TITLE).task.completedAt).toBeNull();
  });

  test('the toast has a close button that dismisses it without undoing', async ({ page }) => {
    await checkbox(page, TITLE).click();
    const toast = page.locator('[data-sonner-toast]', { hasText: `Completed “${TITLE}”` });
    await expect(toast).toBeVisible();
    const close = toast.getByRole('button', { name: 'Close toast' });
    await expect(close).toBeVisible();
    const t = (await toast.boundingBox())!;
    const c = (await close.boundingBox())!;
    const undo = (await toast.getByRole('button', { name: 'Undo' }).boundingBox())!;
    expect(c.x).toBeGreaterThan(undo.x + undo.width);
    expect(c.x + c.width).toBeLessThanOrEqual(t.x + t.width);
    await close.click();
    await expect(toast).toHaveCount(0);
    expect(showTask(TITLE).task.completedAt).not.toBeNull();
  });

  test('the toast goes away on its own after about four seconds', async ({ page }) => {
    await checkbox(page, TITLE).click();
    const toast = page.locator('[data-sonner-toast]', { hasText: `Completed “${TITLE}”` });
    await expect(toast).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(toast).toHaveCount(0, { timeout: 8000 });
  });

  test('toggling the same row again while it is held keeps one row and the last state', async ({ page }) => {
    await checkbox(page, TITLE).click();
    await expect(ghost(page, TITLE)).toHaveCount(1);
    await ghost(page, TITLE).getByRole('checkbox').click();
    await expect(page.locator('[data-ghost]')).toHaveCount(0);
    await expect(section(page, 'ready').locator('[data-slot=task-row]', { hasText: TITLE })).toHaveCount(1);
    await expect(checkbox(page, TITLE)).not.toBeChecked();
    await expect.poll(() => showTask(TITLE).task.completedAt).toBeNull();
  });

  test('a reload during the hold keeps the task completed', async ({ page }) => {
    const sent = watchWrites(page);
    await checkbox(page, TITLE).click();
    await expect.poll(() => sent.length).toBeGreaterThan(0);
    await expect(ghost(page, TITLE)).toHaveCount(1);
    await page.reload();
    await expect(section(page, 'ready').locator('[data-slot=task-row]').first()).toBeVisible();
    await expect(section(page, 'ready').getByText(TITLE)).toHaveCount(0);
    await expect.poll(() => showTask(TITLE).task.completedAt).not.toBeNull();
  });

  test('the keyboard completes a row the same way', async ({ page }) => {
    await checkbox(page, TITLE).focus();
    await page.keyboard.press('Space');
    await expect(ghost(page, TITLE)).toHaveCount(1);
    await expect(ghost(page, TITLE)).toHaveCount(0);
    await expect.poll(() => showTask(TITLE).task.completedAt).not.toBeNull();
  });

  test('completing the last task in a section folds the section away', async ({ page }) => {
    const titles = await section(page, 'in_progress').locator('[data-slot=task-title]').allTextContents();
    expect(titles.length).toBeGreaterThan(0);
    for (const t of titles) {
      await checkbox(page, t).click();
      await expect(ghost(page, t)).toHaveCount(0);
    }
    await expect(section(page, 'in_progress')).toHaveCount(0);
  });

  test('with reduced motion the row just goes: no hold and no ghost, and the data is right', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await showCompleted(page);
    await checkbox(page, TITLE).click();
    await expect(section(page, 'ready').getByText(TITLE)).toHaveCount(0);
    await expect(page.locator('[data-ghost]')).toHaveCount(0);
    await expect(section(page, 'completed').locator('[data-slot=task-row]', { hasText: TITLE })).toHaveCount(1);
    await expect.poll(() => showTask(TITLE).task.completedAt).not.toBeNull();
  });
});

test.describe('due date', () => {
  test('is struck through with the title once the task is completed', async ({ page }) => {
    const due = (title: string) => row(page, title).locator('[data-slot=due-label]');
    // A task due today that does not repeat. Completing a repeat advances it instead of striking the date.
    await expect(due('Call the dentist to move cleaning')).toHaveCSS('text-decoration-line', 'none');

    await checkbox(page, 'Call the dentist to move cleaning').click();
    const held = ghost(page, 'Call the dentist to move cleaning').locator('[data-slot=due-label]');
    await expect(held).toHaveText('Today');
    await expect(held).toHaveCSS('text-decoration-line', 'line-through');

    await showCompleted(page);
    const done = section(page, 'completed').locator('[data-slot=task-row]', { hasText: 'Pay November credit card bill' }).locator('[data-slot=due-label]');
    await expect(done).toHaveText('Nov 16');
    await expect(done).toHaveCSS('text-decoration-line', 'line-through');
    await expect(section(page, 'completed').locator('[data-slot=task-row]', { hasText: 'Call the dentist to move cleaning' }).locator('[data-slot=due-label]')).toHaveCSS('text-decoration-line', 'line-through');

  });
});

test.describe('haptics', () => {
  test('checking off a task gives one very short pulse; un-checking gives none', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as unknown as { pulses: unknown[] };
      w.pulses = [];
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p: unknown) => (w.pulses.push(p), true) });
    });
    const pulses = () => page.evaluate(() => (window as unknown as { pulses: unknown[] }).pulses);
    await checkbox(page, TITLE).click();
    await expect.poll(pulses).toEqual([10]);
    await expect(ghost(page, TITLE)).toHaveCount(0);
    await showCompleted(page);
    await section(page, 'completed').getByRole('checkbox', { name: `Complete ${TITLE}` }).click();
    await expect(section(page, 'ready').getByText(TITLE)).toHaveCount(1);
    expect(await pulses()).toEqual([10]);
  });

  test('without the Vibration API (iOS Safari) completing still works', async ({ page }) => {
    await page.evaluate(() => Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined }));
    await checkbox(page, TITLE).click();
    await expect(section(page, 'ready').getByText(TITLE)).toHaveCount(0);
    await expect.poll(() => showTask(TITLE).task.completedAt).not.toBeNull();
  });
});

test.describe('checkbox', () => {
  test('the check mark fills most of the circle in Completed, and the circle keeps its size', async ({ page }) => {
    await showCompleted(page);
    const done = section(page, 'completed').getByRole('checkbox', { name: `Complete ${DONE_TITLE}` });
    const { c, k } = await done.evaluate((el) => {
      const rect = (e: Element) => e.getBoundingClientRect();
      return { c: rect(el), k: rect(el.querySelector('svg')!) };
    });
    expect(c.width).toBe(c.height);
    expect(k.width / c.width).toBeGreaterThan(0.55);
    expect(k.width / c.width).toBeLessThan(0.8);
    expect(k.x + k.width / 2).toBeCloseTo(c.x + c.width / 2, 0);
    expect(k.y + k.height / 2).toBeCloseTo(c.y + c.height / 2, 0);
    const open = (await checkbox(page, TITLE).boundingBox())!;
    expect(open.width).toBe(c.width);
  });
});

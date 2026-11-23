import { expect, test, type Page } from '@playwright/test';
import { cli, findTask, openBoard, recordDrop, reseed, row, section, showTask, titlesIn } from './helpers';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

const pane = (page: Page) => page.locator('[data-slot=task-pane]');
const editor = (page: Page) => page.locator('[data-slot=task-editor]');
const editorTitle = (page: Page) => editor(page).getByRole('textbox', { name: 'Title' });
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().length === 0);
const handle = (page: Page, title: string) => row(page, title).getByRole('button', { name: /^Reorder/ });

/** Presses the handle and drags it over another row in steps, so dnd-kit sees a real drag. */
async function dragByHandle(page: Page, from: string, onto: string, onRelease?: () => Promise<void>) {
  await settled(page);
  const grip = (await handle(page, from).boundingBox())!;
  const target = (await row(page, onto).boundingBox())!;
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 10, { steps: 4 });
  await page.mouse.move(x + 40, target.y + 4, { steps: 15 });
  await page.waitForTimeout(150);
  await onRelease?.();
  await page.mouse.up();
}

test.describe('live title', () => {
  test('the pane follows the title as it is typed in the list, and settles on Enter', async ({ page }) => {
    const title = row(page, 'Fix squeaky closet door').getByRole('textbox', { name: 'Title' });
    await title.click();
    await expect(editorTitle(page)).toHaveValue('Fix squeaky closet door');
    await page.keyboard.press('End');
    await page.keyboard.type(' hinge');
    await expect(editorTitle(page)).toHaveValue('Fix squeaky closet door hinge');
    expect(findTask('Fix squeaky closet door hinge')).toBeNull();
    await page.keyboard.press('Backspace');
    await expect(editorTitle(page)).toHaveValue('Fix squeaky closet door hing');
    await page.keyboard.type('e');
    await page.keyboard.press('Enter');
    await expect.poll(() => findTask('Fix squeaky closet door hinge')?.task.title).toBe('Fix squeaky closet door hinge');
    await expect(editorTitle(page)).toHaveValue('Fix squeaky closet door hinge');
  });

  test('Escape puts the old title back in both places', async ({ page }) => {
    await row(page, 'Fix squeaky closet door').getByRole('textbox', { name: 'Title' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' nope');
    await expect(editorTitle(page)).toHaveValue('Fix squeaky closet door nope');
    await page.keyboard.press('Escape');
    await expect(editorTitle(page)).toHaveValue('Fix squeaky closet door');
    expect(findTask('Fix squeaky closet door nope')).toBeNull();
  });

  test('editing a task that is not open in the pane leaves the pane alone', async ({ page }) => {
    await row(page, 'Fix squeaky closet door').getByRole('textbox', { name: 'Title' }).click();
    await expect(editorTitle(page)).toHaveValue('Fix squeaky closet door');
    // Clicking another title selects it, so it is the open one; the first is no longer shown.
    await row(page, 'Buy new watch band').getByRole('textbox', { name: 'Title' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await expect(editorTitle(page)).toHaveValue('Buy new watch band!');
    await page.keyboard.press('Escape');
    await expect(editorTitle(page)).toHaveValue('Buy new watch band');
  });
});

test.describe('dates in the pane', () => {
  const field = (page: Page, name: 'Start' | 'Due') => editor(page).locator(`[data-field=${name}]`);

  test('Today and Tomorrow come with the date and replace the weekday', async ({ page }) => {
    await row(page, 'Call the dentist to move cleaning').click();
    await expect(field(page, 'Due')).toContainText('Today, Nov 18');
    await expect(field(page, 'Due')).not.toContainText('Wed');
    await row(page, 'Return library books').click();
    await expect(field(page, 'Due')).toContainText('Tomorrow, Nov 19');
    await expect(field(page, 'Due')).not.toContainText('Thu');
  });

  test('Yesterday too, and other days keep the weekday', async ({ page }) => {
    cli('edit', 'Renew passport', '--due', '2026-11-17');
    await page.reload();
    await row(page, 'Renew passport').click();
    await expect(field(page, 'Due')).toContainText('Yesterday, Nov 17');
    await expect(field(page, 'Due')).not.toContainText('Tue');
    await row(page, 'Fix squeaky closet door').click();
    await expect(field(page, 'Due')).toContainText('None');
    await row(page, 'Twitter litigation claim').click();
    await expect(field(page, 'Due')).toContainText('Sat, Nov 28');
  });

  test('the list rows keep their short labels', async ({ page }) => {
    await expect(row(page, 'Call the dentist to move cleaning')).toContainText('Today');
    await expect(row(page, 'Call the dentist to move cleaning')).not.toContainText('Nov 18');
  });
});

test.describe('deleting', () => {
  /** Where an element sits, sampled every frame while `act` runs and for a while after. */
  async function sample(page: Page, find: { row?: string; section?: string }, act: () => Promise<void>) {
    await page.evaluate((target) => {
      const locate = () =>
        target.section
          ? document.querySelector(`[data-section=${target.section}]`)
          : [...document.querySelectorAll('[data-slot=task-row]')].find((r) => r.textContent?.includes(target.row!));
      const w = window as unknown as { ys: number[]; stop: boolean };
      w.ys = [];
      w.stop = false;
      const tick = () => {
        const el = locate();
        if (el) w.ys.push(el.getBoundingClientRect().y);
        if (!w.stop) requestAnimationFrame(tick);
      };
      tick();
    }, find);
    await act();
    await page.waitForTimeout(700);
    return page.evaluate(() => {
      const w = window as unknown as { ys: number[]; stop: boolean };
      w.stop = true;
      return w.ys;
    });
  }

  test('the rows below slide up into the gap instead of jumping', async ({ page }) => {
    await settled(page);
    const deleted = row(page, 'Renew passport');
    const next = 'Call the dentist to move cleaning';
    const height = (await deleted.boundingBox())!.height;
    const ys = await sample(page, { row: next }, async () => {
      await deleted.hover();
      await deleted.getByRole('button', { name: 'Delete' }).click();
    });
    const start = ys[0]!;
    const end = ys[ys.length - 1]!;
    expect(start - end).toBeCloseTo(height, 0);
    expect(ys.some((y) => y < start - 2 && y > end + 2)).toBe(true);
    await expect(section(page, 'ready').getByText('Renew passport')).toHaveCount(0);
    await expect.poll(() => showTask('Renew passport').task.deletedAt).not.toBeNull();
  });

  test('with reduced motion the rows jump and nothing animates', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await settled(page);
    const deleted = row(page, 'Renew passport');
    const height = (await deleted.boundingBox())!.height;
    const ys = await sample(page, { row: 'Call the dentist to move cleaning' }, async () => {
      await deleted.hover();
      await deleted.getByRole('button', { name: 'Delete' }).click();
    });
    const start = ys[0]!;
    const end = ys[ys.length - 1]!;
    expect(start - end).toBeCloseTo(height, 0);
    expect(ys.filter((y) => y < start - 2 && y > end + 2)).toHaveLength(0);
  });

  test('deleting the last task in a section slides the section away, heading and gap with it', async ({ page }) => {
    cli('done', 'Schedule next drum lesson');
    cli('done', 'Draft holiday card list');
    await page.reload();
    await expect(section(page, 'in_progress').locator('[data-slot=task-row]')).toHaveCount(1);
    await settled(page);
    const lone = row(page, 'Twitter litigation claim');
    const stackHeight = (await section(page, 'waiting').boundingBox())!.y - (await section(page, 'in_progress').boundingBox())!.y;
    const ys = await sample(page, { section: 'waiting' }, async () => {
      await lone.hover();
      await lone.getByRole('button', { name: 'Delete' }).click();
    });
    expect(ys[0]! - ys[ys.length - 1]!).toBeCloseTo(stackHeight, 0);
    expect(ys.some((y) => y < ys[0]! - 2 && y > ys[ys.length - 1]! + 2)).toBe(true);
    await expect(section(page, 'in_progress')).toHaveCount(0);
  });
});

test.describe('drag handle', () => {
  test('every draggable row has one, left of the checkbox, with a grab cursor', async ({ page }) => {
    const grip = handle(page, 'Fix squeaky closet door');
    await expect(grip).toBeVisible();
    const g = (await grip.boundingBox())!;
    const c = (await row(page, 'Fix squeaky closet door').getByRole('checkbox').boundingBox())!;
    expect(g.x + g.width).toBeLessThanOrEqual(c.x);
    expect(await grip.evaluate((el) => getComputedStyle(el).cursor)).toBe('grab');
    // Rows in every section reserve the column, so titles line up; rows that can't be dragged leave it empty.
    const titles = await page.locator('[data-slot=task-row] [data-slot=task-title]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
    expect(new Set(titles).size).toBe(1);
    const heading = (await section(page, 'ready').getByText('Ready', { exact: true }).boundingBox())!.x;
    expect(heading).toBeCloseTo(titles[0]!, 0);
  });

  test('the icon uses the text color and turns blue on hover', async ({ page }) => {
    const grip = handle(page, 'Fix squeaky closet door');
    await page.mouse.move(0, 0);
    const color = () => grip.evaluate((el) => getComputedStyle(el).color);
    const titleColor = await row(page, 'Fix squeaky closet door').locator('[data-slot=task-title]').evaluate((el) => getComputedStyle(el).color);
    expect(await color()).toBe(titleColor);
    await grip.hover();
    await expect.poll(color).not.toBe(titleColor);
    const blue = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.className = 'text-link';
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    });
    expect(await color()).toBe(blue);
  });

  test('the grip shows only while the row is hovered, the handle has keyboard focus, or it is dragged, and never moves the title', async ({ page }) => {
    const title = 'Fix squeaky closet door';
    const grip = handle(page, title);
    const opacity = () => grip.evaluate((el) => Number(getComputedStyle(el).opacity));
    const titleX = async () => (await row(page, title).locator('[data-slot=task-title]').boundingBox())!.x;
    await page.mouse.move(0, 0);
    await expect.poll(opacity).toBe(0);
    const resting = await titleX();

    await row(page, title).hover();
    await expect.poll(opacity).toBe(1);
    expect(await titleX()).toBe(resting);
    await page.mouse.move(0, 0);
    await expect.poll(opacity).toBe(0);

    // Hidden, it still takes the press, so a drag can start from where the grip will appear.
    await row(page, title).getByRole('checkbox').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(grip).toBeFocused();
    await expect.poll(opacity).toBe(1);
    await page.keyboard.press('Tab');
    await expect.poll(opacity).toBe(0);

    const box = (await grip.boundingBox())!;
    const target = (await row(page, 'Buy new watch band').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 10, { steps: 4 });
    await page.mouse.move(box.x + 40, target.y + 4, { steps: 12 });
    await expect(page.locator('[data-slot=drag-handle][data-dragging]')).toHaveCount(1);
    await expect.poll(() => page.locator('[data-slot=drag-handle][data-dragging]').evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
    await page.mouse.up();
  });

  test('pressing and dragging anywhere else on the row does not drag it', async ({ page }) => {
    const before = await titlesIn(page, 'ready');
    await settled(page);
    const box = (await row(page, before[2]!).boundingBox())!;
    const target = (await row(page, before[0]!).boundingBox())!;
    // Past the title and quick-action areas, on the row's empty middle, so only a drag could react.
    const x = box.x + box.width * 0.55;
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, box.y + box.height / 2 + 10, { steps: 4 });
    await page.mouse.move(x, target.y + 4, { steps: 15 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    expect(await titlesIn(page, 'ready')).toEqual(before);
  });

  test('dragging by the handle reorders, and keyboard drag works from the handle', async ({ page }) => {
    const before = await titlesIn(page, 'ready');
    await dragByHandle(page, before[2]!, before[0]!);
    await expect.poll(() => titlesIn(page, 'ready')).toEqual([before[2], before[0], before[1], ...before.slice(3)]);

    await handle(page, before[1]!).focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(250);
    await page.keyboard.press('Space');
    await expect.poll(() => titlesIn(page, 'ready').then((t) => t.indexOf(before[1]!))).toBe(3);
  });

  test('rows in Completed and Trash have no handle', async ({ page }) => {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Show completed' }).click();
    await page.keyboard.press('Escape');
    await section(page, 'completed').getByRole('button', { name: /^Completed/ }).click();
    await expect(section(page, 'completed').locator('[data-slot=task-row]').first()).toBeVisible();
    await expect(section(page, 'completed').locator('[data-slot=drag-handle]')).toHaveCount(0);
  });
});

test.describe('drop', () => {
  test('the dragged overlay settles into the new position instead of flying back', async ({ page }) => {
    const before = await titlesIn(page, 'ready');
    const moved = before[2]!;
    let recording: Awaited<ReturnType<typeof recordDrop>>;
    await dragByHandle(page, moved, before[0]!, async () => {
      recording = await recordDrop(page, moved);
    });
    await expect.poll(() => titlesIn(page, 'ready')).toEqual([moved, ...before.filter((t) => t !== moved)]);
    await settled(page);
    const frames = await recording!.stop();
    const landed = (await row(page, moved).boundingBox())!.y;
    const overlay = frames.map((f) => f.overlay).filter((y): y is number => y !== null);
    expect(overlay.length).toBeGreaterThan(0);
    // It was dropped above where it started, so it must never head back down past where it lands.
    expect(Math.max(...overlay)).toBeLessThanOrEqual(landed + 20);
    expect(Math.abs(overlay[overlay.length - 1]! - landed)).toBeLessThanOrEqual(4);
    // The list's own copy never shows at the old spot at full strength once released.
    const list = frames.map((f) => f.list).filter((y): y is number => y !== null);
    expect(Math.min(...list.slice(-3))).toBeCloseTo(landed, 0);
  });
});

test.describe('drop into another section', () => {
  test('the overlay settles into the section it was dropped in', async ({ page }) => {
    let recording: Awaited<ReturnType<typeof recordDrop>>;
    await dragByHandle(page, 'Replace furnace filter', 'Draft holiday card list', async () => {
      recording = await recordDrop(page, 'Replace furnace filter');
    });
    await expect(section(page, 'in_progress').locator('[data-slot=task-row]', { hasText: 'Replace furnace filter' })).toBeVisible();
    await settled(page);
    const frames = await recording!.stop();
    const landed = (await row(page, 'Replace furnace filter').boundingBox())!.y;
    const overlay = frames.map((f) => f.overlay).filter((y): y is number => y !== null);
    expect(overlay.length).toBeGreaterThan(0);
    expect(Math.max(...overlay)).toBeLessThanOrEqual(landed + 20);
    expect(Math.abs(overlay[overlay.length - 1]! - landed)).toBeLessThanOrEqual(4);
  });
});

test.describe('drop highlight', () => {
  const highlight = (page: Page, title: string) => row(page, title).locator('[data-slot=drop-highlight]');

  test('the dropped row is highlighted for 2s, then fades out', async ({ page }) => {
    const before = await titlesIn(page, 'ready');
    const moved = before[2]!;
    await expect(highlight(page, moved)).not.toHaveAttribute('data-active', 'true');
    await dragByHandle(page, moved, before[0]!);
    await expect(highlight(page, moved)).toHaveAttribute('data-active', 'true');
    expect(await highlight(page, moved).evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    await expect(highlight(page, before[0]!)).not.toHaveAttribute('data-active', 'true');
    await page.waitForTimeout(1300);
    await expect(highlight(page, moved)).toHaveAttribute('data-active', 'true');

    const opacities = await page.evaluate(async (title) => {
      const el = [...document.querySelectorAll('[data-slot=task-row]')].find((r) => r.textContent?.includes(title))!.querySelector('[data-slot=drop-highlight]')!;
      const seen: number[] = [];
      const end = performance.now() + 2200;
      while (performance.now() < end) {
        seen.push(Number(getComputedStyle(el).opacity));
        await new Promise((r) => requestAnimationFrame(r));
      }
      return seen;
    }, moved);
    expect(opacities[0]).toBe(1);
    expect(opacities.some((o) => o > 0.05 && o < 0.95)).toBe(true);
    expect(opacities[opacities.length - 1]).toBe(0);
    await expect(highlight(page, moved)).not.toHaveAttribute('data-active', 'true');
  });

  test('a task dragged into another section is highlighted once it lands there', async ({ page }) => {
    await dragByHandle(page, 'Replace furnace filter', 'Draft holiday card list');
    await expect(section(page, 'in_progress').locator('[data-slot=task-row]', { hasText: 'Replace furnace filter' }).locator('[data-slot=drop-highlight]')).toHaveAttribute('data-active', 'true');
  });

  test('with reduced motion the highlight still shows, and goes without fading', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const before = await titlesIn(page, 'ready');
    await dragByHandle(page, before[2]!, before[0]!);
    const marker = highlight(page, before[2]!);
    await expect(marker).toHaveAttribute('data-active', 'true');
    expect(await marker.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    await expect(marker).not.toHaveAttribute('data-active', 'true', { timeout: 3500 });
    expect(await marker.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  });
});

test.describe('layout', () => {
  test('the list does not move when a task is selected or deselected', async ({ page }) => {
    const x = async () => ((await page.locator('main').boundingBox())!.x);
    const resting = await x();
    const toolbarX = (await page.getByRole('button', { name: 'Add task' }).first().boundingBox())!.x;
    await row(page, 'Fix squeaky closet door').click();
    await expect(pane(page)).toBeVisible();
    await settled(page);
    expect(await x()).toBe(resting);
    expect((await page.getByRole('button', { name: 'Add task' }).first().boundingBox())!.x).toBe(toolbarX);
    await page.mouse.click(40, 400);
    await expect(pane(page)).toHaveCount(0);
    await settled(page);
    expect(await x()).toBe(resting);
  });

  test('the list leaves 400px on the right for the pane, and is not centered in the window', async ({ page }) => {
    const main = (await page.locator('main').boundingBox())!;
    expect(main.x).toBeGreaterThan(0);
    expect(main.x + main.width).toBeLessThanOrEqual(1280 - 400);
    await page.setViewportSize({ width: 1024, height: 860 });
    const narrow = (await page.locator('main').boundingBox())!;
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(1024 - 400);
    await row(page, 'Fix squeaky closet door').click();
    await settled(page);
    expect((await page.locator('main').boundingBox())!.x).toBe(narrow.x);
  });

  test('below 1024px nothing is reserved', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 860 });
    const main = (await page.locator('main').boundingBox())!;
    expect(main.x + main.width / 2).toBeCloseTo(450, -1);
  });
});

import { expect, test, type Page } from '@playwright/test';
import { cliJson, openBoard, reseed, row, tagList, tagNames, type CliTask } from './helpers';

const MANY = 'Finance quarterly action items';
const ONE = 'Buy new watch band';

test.beforeEach(async ({ page }) => {
  reseed();
  await openBoard(page);
});

const editor = (page: Page) => page.locator('[data-slot=task-editor]');
const picker = (page: Page) => page.locator('[data-slot=tag-picker]');
const tagRow = (page: Page, name: string) => picker(page).locator('[data-slot=tag-row]', { has: page.getByRole('option', { name, exact: true }) });

async function openPicker(page: Page, title = ONE) {
  await row(page, title).getByText(title).click();
  await editor(page).locator('[data-field=Tags]').click();
  await expect(picker(page)).toBeVisible();
}

const untagged = () => cliJson<{ sections: { tasks: CliTask[] }[] }>('board').sections.flatMap((s) => s.tasks).find((t) => t.tags.length === 0)!.title;

test('rows show up to two tag chips in order, then +N for the rest', async ({ page }) => {
  const names = tagNames(MANY);
  expect(names.length).toBe(3);
  const chips = row(page, MANY).locator('[data-slot=trailing-meta] [data-slot=tag-chip]');
  await expect(chips).toHaveText([names[0]!, names[1]!, '+1 more tag']);
  const one = tagNames(ONE);
  expect(one.length).toBeGreaterThanOrEqual(1);
  await expect(row(page, ONE).locator('[data-slot=trailing-meta] [data-slot=tag-chip]').first()).toHaveText(one[0]!);
  await expect(row(page, untagged()).locator('[data-slot=tag-chip]')).toHaveCount(0);
});

test('the sheet lists every tag on the task, and None when it has none', async ({ page }) => {
  await row(page, MANY).getByText(MANY).click();
  await expect(editor(page).locator('[data-field=Tags] [data-slot=tag-chip]')).toHaveText(tagNames(MANY));
  const bare = untagged();
  await row(page, bare).getByText(bare).click();
  await expect(editor(page).locator('[data-field=Tags]')).toContainText('None');
});

test('the picker lists tags alphabetically, with checks and no counts', async ({ page }) => {
  await openPicker(page, MANY);
  const names = (await picker(page).getByRole('option').allInnerTexts()).map((t) => t.trim());
  expect(names).toEqual(tagList().map((t) => t.name));
  for (const name of tagNames(MANY)) await expect(picker(page).getByRole('option', { name, exact: true })).toHaveAttribute('data-checked', 'true');
  await expect(picker(page).locator('[data-slot=tag-count]')).toHaveCount(0);
  await expect(picker(page).getByPlaceholder('Search or create tag')).toBeVisible();
});

test('tapping a tag puts it on the task and off again', async ({ page }) => {
  const before = tagNames(ONE);
  await openPicker(page);
  await picker(page).getByRole('option', { name: 'work', exact: true }).click();
  await expect(editor(page).locator('[data-field=Tags] [data-slot=tag-chip]').last()).toHaveText('work');
  await expect.poll(() => tagNames(ONE)).toEqual([...before, 'work']);
  await picker(page).getByRole('option', { name: 'work', exact: true }).click();
  await expect.poll(() => tagNames(ONE)).toEqual(before);
});

test('typing a new name offers Create, and Return makes the tag and puts it on the task', async ({ page }) => {
  await openPicker(page);
  await picker(page).getByPlaceholder('Search or create tag').fill('garden');
  await expect(picker(page).getByRole('option')).toHaveCount(1);
  await expect(picker(page).locator('[data-slot=tag-create]')).toHaveText('Create tag “garden”');
  await page.keyboard.press('Enter');
  await expect.poll(() => tagNames(ONE).includes('garden')).toBe(true);
  expect(tagList().find((t) => t.name === 'garden')?.count).toBe(1);
  await expect(editor(page).locator('[data-field=Tags]')).toContainText('garden');
  await expect(picker(page).getByRole('option', { name: 'garden', exact: true })).toHaveAttribute('data-checked', 'true');
});

test('a partial name lists the matches first and Create after them', async ({ page }) => {
  await openPicker(page);
  await picker(page).getByPlaceholder('Search or create tag').fill('out');
  await expect(picker(page).getByRole('option')).toHaveText(['outdoors', 'Create tag “out”']);
});

test('a name that is already a tag, ignoring case, offers no Create and reuses it', async ({ page }) => {
  await openPicker(page);
  await picker(page).getByPlaceholder('Search or create tag').fill('WORK');
  await expect(picker(page).locator('[data-slot=tag-create]')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect.poll(() => tagNames(ONE).includes('work')).toBe(true);
  expect(tagList().filter((t) => t.name.toLowerCase() === 'work')).toHaveLength(1);
});

test('a name with a comma is refused with a reason', async ({ page }) => {
  await openPicker(page);
  await picker(page).getByPlaceholder('Search or create tag').fill('a, b');
  await expect(picker(page).locator('[data-slot=tag-error]')).toHaveText(/comma/i);
  await expect(picker(page).locator('[data-slot=tag-create]')).toHaveCount(0);
});

test('rename changes the tag on every task', async ({ page }) => {
  const names = tagNames(MANY);
  const target = names[0]!;
  await openPicker(page, MANY);
  await tagRow(page, target).getByRole('button', { name: `Manage ${target}` }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const input = picker(page).getByRole('textbox', { name: `Rename ${target}` });
  await input.fill('household');
  await input.press('Enter');
  await expect.poll(() => tagList().some((t) => t.name === 'household')).toBe(true);
  expect(tagList().some((t) => t.name === target)).toBe(false);
  expect(tagNames(MANY)).toContain('household');
  await expect(editor(page).locator('[data-field=Tags] [data-slot=tag-chip]').first()).toHaveText('household');
});

test('rename refuses a name another tag has', async ({ page }) => {
  await openPicker(page, MANY);
  await tagRow(page, 'car').getByRole('button', { name: 'Manage car' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const input = picker(page).getByRole('textbox', { name: 'Rename car' });
  await input.fill('Home');
  await input.press('Enter');
  await expect(picker(page).locator('[data-slot=tag-error]')).toBeVisible();
  await input.press('Escape');
  await expect(picker(page)).toBeVisible();
  expect(tagList().some((t) => t.name === 'car')).toBe(true);
});

test('delete asks first, then removes the tag from every task', async ({ page }) => {
  const count = tagList().find((t) => t.name === 'someday')!.count;
  await openPicker(page, MANY);
  await tagRow(page, 'someday').getByRole('button', { name: 'Manage someday' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(picker(page).locator('[data-slot=tag-delete]')).toContainText(`Delete “someday”? It comes off ${count} tasks.`);
  await picker(page).getByRole('button', { name: 'Cancel' }).click();
  expect(tagList().some((t) => t.name === 'someday')).toBe(true);
  await tagRow(page, 'someday').getByRole('button', { name: 'Manage someday' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await picker(page).getByRole('button', { name: 'Delete tag' }).click();
  await expect.poll(() => tagList().some((t) => t.name === 'someday')).toBe(false);
  await expect(picker(page).getByRole('option', { name: 'someday', exact: true })).toHaveCount(0);
});

const openSearch = async (page: Page) => {
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByPlaceholder('Search tasks')).toBeVisible();
};
const results = (page: Page) => page.locator('[data-slot=command-item][data-task-id]');
const resultTitles = async (page: Page) => (await results(page).locator('[data-slot=result-title]').allInnerTexts()).map((t) => t.trim()).sort();
const searchTitles = (...tags: string[]) =>
  cliJson<{ task: CliTask }[]>('search', ...tags.flatMap((t) => ['--tag', t])).map((r) => r.task.title).sort();

test('the Tags menu lists every tag with its count, and the AND note', async ({ page }) => {
  await openSearch(page);
  await page.getByRole('button', { name: 'Tags' }).click();
  const menu = page.locator('[data-slot=tags-menu]');
  const tags = tagList();
  await expect(menu.getByRole('menuitemcheckbox')).toHaveCount(tags.length);
  for (const t of tags) await expect(menu.locator(`[data-tag-id="${t.id}"]`)).toContainText(`${t.name}${t.count}`);
  await expect(menu.locator('[data-slot=tags-note]')).toHaveText('Shows tasks that have every selected tag.');
});

test('filtering by one tag lists its tasks; a second tag narrows to tasks with both', async ({ page }) => {
  await openSearch(page);
  await page.getByRole('button', { name: 'Tags' }).click();
  const menu = page.locator('[data-slot=tags-menu]');
  await menu.getByRole('menuitemcheckbox', { name: /^finance/ }).click();
  await expect.poll(() => resultTitles(page)).toEqual(searchTitles('finance'));
  expect((await resultTitles(page)).length).toBeGreaterThan(1);
  await menu.getByRole('menuitemcheckbox', { name: /^health/ }).click();
  await expect.poll(() => resultTitles(page)).toEqual(searchTitles('finance', 'health'));
  expect(await resultTitles(page)).toContain(MANY);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Remove tag finance' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove tag health' }).click();
  await expect.poll(() => resultTitles(page)).toEqual(searchTitles('finance'));
});

test('a tag filter combines with the text query, and results show tag chips', async ({ page }) => {
  await openSearch(page);
  await page.getByPlaceholder('Search tasks').fill('pay');
  await page.getByRole('button', { name: 'Tags' }).click();
  await page.locator('[data-slot=tags-menu]').getByRole('menuitemcheckbox', { name: /^finance/ }).click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await resultTitles(page)).length).toBeGreaterThan(0);
  expect(await resultTitles(page)).toEqual(cliJson<{ task: CliTask }[]>('search', 'pay', '--tag', 'finance').map((r) => r.task.title).sort());
  await expect(results(page).first().locator('[data-slot=tag-chip]').first()).toBeVisible();
});

test('a tag name is searchable as text', async ({ page }) => {
  await openSearch(page);
  await page.getByPlaceholder('Search tasks').fill('outdoors');
  await expect.poll(() => resultTitles(page)).toEqual(searchTitles('outdoors'));
  expect((await resultTitles(page)).length).toBeGreaterThan(0);
});

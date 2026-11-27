/**
 * Subtasks against local Supabase, through the same functions the CLI commands call: add and edit with
 * subtask flags, ordering by sort key, the counts on show and the board, search results, backups and
 * what deleting a task does to them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportAll, importAll } from '../src/backup.ts';
import { loadBoard } from '../src/commands.ts';
import { adminClient, devUserId } from '../src/db.ts';
import { addTask, deleteTask, editTask, restoreTask, search, showTask, type Context } from '../src/tasks.ts';

const MARK = `st${Date.now().toString(36)}`;
const TODAY = '2026-11-18';

const admin = adminClient();
let ctx: Context;
const ids: string[] = [];

const name = (label: string) => `${MARK} ${label}`;
const marks = (subtasks: { title: string; done: boolean }[] | undefined) => (subtasks ?? []).map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`);

async function add(label: string, subtasks: string[] = []) {
  const result = await addTask(ctx, name(label), { subtasks });
  ids.push(result.task.id);
  return result;
}

const show = (label: string) => showTask(ctx, name(label));

beforeAll(async () => {
  ctx = { scope: { db: admin, userId: await devUserId(admin) }, today: TODAY, now: '2026-11-18T12:00:00.000Z' };
});

afterAll(async () => {
  await admin.from('tasks').delete().in('id', ids);
  await admin.from('tombstones').delete().in('id', ids);
});

describe('add --subtask', () => {
  it('creates the subtasks in the order given, none done', async () => {
    const { task, subtaskCount } = await add('three', ['Check the weather', ' Pack lunch ', 'Charge phone']);
    expect(marks(task.subtasks)).toEqual(['[ ] Check the weather', '[ ] Pack lunch', '[ ] Charge phone']);
    expect(subtaskCount).toEqual({ done: 0, total: 3 });
    const shown = await show('three');
    expect(marks(shown.task.subtasks)).toEqual(['[ ] Check the weather', '[ ] Pack lunch', '[ ] Charge phone']);
    expect(shown.subtaskCount).toEqual({ done: 0, total: 3 });
  });

  it('refuses an empty subtask and adds nothing', async () => {
    await expect(addTask(ctx, name('empty subtask'), { subtasks: ['ok', '  '] })).rejects.toThrow('title is required');
    expect((await admin.from('tasks').select('id').eq('title', name('empty subtask'))).data).toEqual([]);
  });

  it('a task with none has an empty list and a zero count', async () => {
    const { task, subtaskCount } = await add('none');
    expect(task.subtasks).toEqual([]);
    expect(subtaskCount).toEqual({ done: 0, total: 0 });
  });
});

describe('edit', () => {
  it('ticks, renames, removes, adds and moves, and the order and ticks persist', async () => {
    await add('edit', ['A one', 'B two', 'C three', 'D four']);
    const result = await editTask(ctx, name('edit'), {
      subtasks: { done: ['1', 'C'], rename: ['2=B two (renamed)'], remove: ['4'], add: ['E five'], move: ['3=1'] },
    });
    const expected = ['[x] C three', '[x] A one', '[ ] B two (renamed)', '[ ] E five'];
    expect(marks(result.task.subtasks)).toEqual(expected);
    const stored = await show('edit');
    expect(marks(stored.task.subtasks)).toEqual(expected);
    expect(stored.subtaskCount).toEqual({ done: 2, total: 4 });
  });

  it('moves a subtask to the top and the bottom', async () => {
    await add('moves', ['One', 'Two', 'Three']);
    await editTask(ctx, name('moves'), { subtasks: { move: ['Three=1'] } });
    expect(marks((await show('moves')).task.subtasks)).toEqual(['[ ] Three', '[ ] One', '[ ] Two']);
    await editTask(ctx, name('moves'), { subtasks: { move: ['Three=3'] } });
    expect(marks((await show('moves')).task.subtasks)).toEqual(['[ ] One', '[ ] Two', '[ ] Three']);
  });

  it('can change fields and subtasks in one edit', async () => {
    await add('both', ['Only']);
    const result = await editTask(ctx, name('both'), { flag: true, due: '+2d', subtasks: { done: ['1'] } });
    expect(result.task).toMatchObject({ flagged: true, dueDate: '2026-11-20' });
    expect((await show('both')).subtaskCount).toEqual({ done: 1, total: 1 });
  });

  it('writes none of it when one ref is wrong', async () => {
    await add('atomic', ['One', 'Two']);
    await expect(editTask(ctx, name('atomic'), { title: name('atomic renamed'), subtasks: { done: ['1'], remove: ['9'] } })).rejects.toThrow('No subtask 9');
    const shown = await show('atomic');
    expect(shown.task.title).toBe(name('atomic'));
    expect(marks(shown.task.subtasks)).toEqual(['[ ] One', '[ ] Two']);
  });

  it('leaves a completed task editable but not one in Trash', async () => {
    const { task } = await add('trashed', ['One']);
    await deleteTask(ctx, task.id, false);
    await expect(editTask(ctx, task.id, { subtasks: { add: ['Two'] } })).rejects.toThrow('Recently deleted');
    await restoreTask(ctx, task.id);
    await editTask(ctx, task.id, { subtasks: { add: ['Two'] } });
    expect((await show('trashed')).subtaskCount.total).toBe(2);
  });
});

describe('board and search', () => {
  it('board --json carries subtasks and subtaskCount on every task', async () => {
    await add('board', ['x', 'y']);
    await editTask(ctx, name('board'), { subtasks: { done: ['y'] } });
    const board = await loadBoard(admin, ctx.scope.userId, { today: TODAY, completed: true, trash: true });
    const tasks = board.sections.flatMap((s) => [...s.tasks, ...(s.later ?? [])]);
    const mine = tasks.find((t) => t.title === name('board'))!;
    expect(mine.subtaskCount).toEqual({ done: 1, total: 2 });
    expect(marks(mine.subtasks)).toEqual(['[ ] x', '[x] y']);
    expect(tasks.every((t) => t.subtaskCount.total === (t.subtasks ?? []).length)).toBe(true);
  });

  it('search results include their subtasks', async () => {
    await add('findable', ['Looked up']);
    const [hit] = await search(ctx, name('findable'), {});
    expect(hit?.subtaskCount).toEqual({ done: 0, total: 1 });
    expect(marks(hit?.task.subtasks)).toEqual(['[ ] Looked up']);
  });
});

describe('backup and deleting', () => {
  it('export includes subtasks, and import restores them with their order and ticks', async () => {
    const { task } = await add('backup', ['First', 'Second']);
    await editTask(ctx, task.id, { subtasks: { done: ['2'], move: ['2=1'] } });
    const backup = await exportAll(ctx.scope);
    const mine = (backup.subtasks ?? []).filter((s) => s.task_id === task.id);
    expect(mine.map((s) => s.title).sort()).toEqual(['First', 'Second']);

    await admin.from('tasks').delete().eq('id', task.id);
    await importAll(ctx.scope, { ...backup, tasks: backup.tasks.filter((t) => t.id === task.id), positions: [], subtasks: mine, tags: [], task_tags: [] }, false);
    expect(marks((await show('backup')).task.subtasks)).toEqual(['[x] Second', '[ ] First']);
  });

  it('a backup from before subtasks still imports', async () => {
    const backup = await exportAll(ctx.scope);
    const older = { ...backup };
    delete older.subtasks;
    await importAll(ctx.scope, { ...older, tasks: [], positions: [], tags: [], task_tags: [] }, false);
  });

  it('deleting a task for good takes its subtasks with it', async () => {
    const { task } = await add('forever', ['Gone soon']);
    await deleteTask(ctx, task.id, false);
    await deleteTask(ctx, task.id, true);
    const { data } = await admin.from('subtasks').select('id').eq('task_id', task.id);
    expect(data).toEqual([]);
  });
});

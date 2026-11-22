/**
 * The CLI's Hide until rules against local Supabase, through the same functions the commands call:
 * only Open tasks have a start date, only Waiting tasks have hideUntil, status changes never ask,
 * and a version 1 backup is mapped the way the migration maps stored rows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, devUserId } from '../src/db.ts';
import { importAll, upgradeBackup, type BackupV1 } from '../src/backup.ts';
import { addTask, deleteTask, DecisionNeeded, editTask, moveTask, runAction, setStatus, showTask, type Context } from '../src/tasks.ts';

const MARK = `hu${Date.now().toString(36)}`;
const TODAY = '2026-11-18';

const admin = adminClient();
let ctx: Context;
const ids: string[] = [];

const name = (label: string) => `${MARK} ${label}`;

async function add(label: string, options: Parameters<typeof addTask>[2] = {}) {
  const result = await addTask(ctx, name(label), options);
  ids.push(result.task.id);
  return result;
}

const show = async (label: string) => (await showTask(ctx, name(label))).task;

beforeAll(async () => {
  ctx = { scope: { db: admin, userId: await devUserId(admin) }, today: TODAY, now: '2026-11-18T12:00:00.000Z' };
});

afterAll(async () => {
  await admin.from('tasks').delete().in('id', ids);
  await admin.from('tombstones').delete().in('id', ids);
});

describe('add and edit', () => {
  it('adds a Waiting task with a hide-until date', async () => {
    const { task, placement } = await add('add waiting', { status: 'waiting', hideUntil: '+3d', due: '+1d' });
    expect(task).toMatchObject({ status: 'waiting', hideUntil: '2026-11-21', startDate: null, dueDate: '2026-11-19' });
    expect(placement).toBe('waiting_later');
  });

  it('refuses --start on Waiting and In Progress tasks, with the guideline wording', async () => {
    for (const status of ['waiting', 'in_progress']) {
      await expect(addTask(ctx, name('start refused'), { status, start: '+2d' })).rejects.toThrow('Start dates only apply to Ready and Upcoming tasks.');
    }
    const waiting = await add('edit start refused', { status: 'waiting' });
    await expect(editTask(ctx, waiting.task.id, { start: '+2d' })).rejects.toThrow('Start dates only apply to Ready and Upcoming tasks.');
    const progress = await add('edit start refused 2', { status: 'in_progress' });
    await expect(editTask(ctx, progress.task.id, { start: '+2d' })).rejects.toThrow('Start dates only apply to Ready and Upcoming tasks.');
  });

  it('refuses --hide-until on a task that is not Waiting', async () => {
    await expect(addTask(ctx, name('hide refused'), { hideUntil: '+2d' })).rejects.toThrow(/only applies to Waiting/);
    const open = await add('edit hide refused');
    await expect(editTask(ctx, open.task.id, { hideUntil: '+2d' })).rejects.toThrow(/only applies to Waiting/);
  });

  it('edits hide-until on a Waiting task and clears it with none', async () => {
    const { task } = await add('edit hide', { status: 'waiting', hideUntil: '+3d' });
    expect((await editTask(ctx, task.id, { hideUntil: '+5d' })).task.hideUntil).toBe('2026-11-23');
    expect((await editTask(ctx, task.id, { hideUntil: 'none' })).placement).toBe('waiting');
  });
});

describe('status changes never ask', () => {
  it('going into Waiting clears the start date; Don\'t hide is the default', async () => {
    const { task } = await add('into waiting', { start: '+5d' });
    const moved = await setStatus(ctx, task.id, 'waiting');
    expect(moved.task).toMatchObject({ status: 'waiting', startDate: null, hideUntil: null });
    expect(moved.placement).toBe('waiting');
  });

  it('going into Waiting with --hide-until answers the picker', async () => {
    const { task } = await add('into waiting date', { start: '+5d' });
    const moved = await setStatus(ctx, task.id, 'waiting', { hideUntil: '+4d' });
    expect(moved.task).toMatchObject({ status: 'waiting', startDate: null, hideUntil: '2026-11-22' });
    expect(moved.placement).toBe('waiting_later');
  });

  it('going into In Progress (Start now) clears the start date', async () => {
    const { task } = await add('start now', { start: '+5d' });
    expect((await setStatus(ctx, task.id, 'in_progress')).task).toMatchObject({ status: 'in_progress', startDate: null });
  });

  it('leaving Waiting clears hideUntil, even after the due date, and lands in Ready', async () => {
    const { task } = await add('leave waiting', { status: 'waiting', hideUntil: '+9d', due: 'today' });
    const moved = await setStatus(ctx, task.id, 'open');
    expect(moved.task).toMatchObject({ status: 'open', hideUntil: null, startDate: null });
    expect(moved.placement).toBe('ready');
  });

  it('Move to In Progress (act) clears hideUntil', async () => {
    const { task } = await add('act in progress', { status: 'waiting', hideUntil: '+3d' });
    const moved = await runAction(ctx, task.id, 'moveToInProgress', {});
    expect(moved.task).toMatchObject({ status: 'in_progress', hideUntil: null });
  });

  it('moveToWaiting takes --hide-until, and Hide until presets set it', async () => {
    const { task } = await add('act waiting');
    const waiting = await runAction(ctx, task.id, 'moveToWaiting', { hideUntil: '+2d' });
    expect(waiting.task).toMatchObject({ status: 'waiting', hideUntil: '2026-11-20' });
    const extended = await runAction(ctx, task.id, 'checkBack.week', {});
    expect(extended.task.hideUntil).toBe('2026-11-25');
  });

  it('rejects the old --start answers with errors that point to --hide-until', async () => {
    const { task } = await add('old start', { start: '+5d' });
    await expect(setStatus(ctx, task.id, 'waiting', { start: 'keep' })).rejects.toThrow('--hide-until');
    await expect(setStatus(ctx, task.id, 'waiting', { start: '+2d' })).rejects.toThrow('--hide-until');
    await expect(setStatus(ctx, task.id, 'in_progress', { start: 'clear' })).rejects.toThrow(/no longer exists/);
    await expect(setStatus(ctx, task.id, 'in_progress', { start: '+2d' })).rejects.toThrow('Start dates only apply to Ready and Upcoming tasks.');
    expect((await show('old start')).startDate).toBe('2026-11-23');
  });

  it('rejects --hide-until when the target status is not Waiting', async () => {
    const { task } = await add('hide to ready', { status: 'waiting' });
    await expect(setStatus(ctx, task.id, 'open', { hideUntil: '+2d' })).rejects.toThrow(/only applies to Waiting/);
  });
});

describe('moves into Upcoming', () => {
  it('drops a Waiting task with a hide-until date into Upcoming with no question', async () => {
    const { task } = await add('to upcoming', { status: 'waiting', hideUntil: '+9d', due: '+20d' });
    const moved = await moveTask(ctx, task.id, { upcoming: true, start: '+4d' });
    expect(moved.task).toMatchObject({ status: 'open', hideUntil: null, startDate: '2026-11-22' });
    expect(moved.placement).toBe('upcoming');
  });

  it('only asks when the task is due today or earlier', async () => {
    const { task } = await add('to upcoming due today', { status: 'waiting', hideUntil: '+9d', due: 'today' });
    await expect(moveTask(ctx, task.id, { upcoming: true, start: '+4d' })).rejects.toBeInstanceOf(DecisionNeeded);
    const moved = await moveTask(ctx, task.id, { upcoming: true, start: '+4d', clearDue: true });
    expect(moved.task).toMatchObject({ status: 'open', dueDate: null, hideUntil: null, startDate: '2026-11-22' });
  });
});

describe('backups', () => {
  it('maps a version 1 backup the way the migration does', () => {
    const row = { title: 't', description: '', flagged: false, due_date: null, repeat: null, completed_at: null, completed_on: null, deleted_at: null, deleted_on: null, created_at: '2026-11-01T00:00:00Z' };
    const backup: BackupV1 = {
      version: 1,
      exportedAt: '2026-11-18T00:00:00Z',
      positions: [],
      tasks: [
        { ...row, id: 'a', status: 'waiting', start_date: '2026-12-01' },
        { ...row, id: 'b', status: 'in_progress', start_date: '2026-12-05' },
        { ...row, id: 'c', status: 'open', start_date: '2026-12-05' },
        { ...row, id: 'd', status: 'waiting', start_date: null },
      ],
    };
    const upgraded = upgradeBackup(backup);
    expect(upgraded.version).toBe(2);
    expect(upgraded.tasks.map((t) => [t.id, t.status, t.start_date, t.hide_until])).toEqual([
      ['a', 'waiting', null, '2026-12-01'],
      ['b', 'in_progress', null, null],
      ['c', 'open', '2026-12-05', null],
      ['d', 'waiting', null, null],
    ]);
  });

  it('imports a version 1 backup', async () => {
    const id = crypto.randomUUID();
    ids.push(id);
    const backup: BackupV1 = {
      version: 1,
      exportedAt: '2026-11-18T00:00:00Z',
      positions: [],
      tasks: [
        { id, title: name('imported v1'), description: '', status: 'waiting', flagged: false, start_date: '2026-12-01', due_date: '2026-11-20', repeat: null, completed_at: null, completed_on: null, deleted_at: null, deleted_on: null, created_at: '2026-11-01T00:00:00Z' },
      ],
    };
    expect(await importAll(ctx.scope, backup, false)).toEqual({ tasks: 1, positions: 0 });
    expect(await show('imported v1')).toMatchObject({ status: 'waiting', startDate: null, hideUntil: '2026-12-01', dueDate: '2026-11-20' });
  });

  it('rejects an unknown backup version', () => {
    expect(() => upgradeBackup({ version: 3 } as never)).toThrow(/Unknown backup version 3/);
  });
});

it('still moves a task to Trash', async () => {
  const { task } = await add('trash me', { status: 'waiting', hideUntil: '+3d' });
  expect((await deleteTask(ctx, task.id, false)).task.deletedAt).not.toBeNull();
});

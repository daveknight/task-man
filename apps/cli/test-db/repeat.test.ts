/**
 * Repeats against local Supabase, through the same functions the CLI commands call.
 * `--today` is the context's today: done and skip with no `--on` use it.
 */
import { isOccurrenceHistory } from '@app/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportAll, importAll } from '../src/backup.ts';
import { adminClient, devUserId } from '../src/db.ts';
import { addTask, doneTask, editTask, historyTask, showTask, skipTask, undoneTask, type Context } from '../src/tasks.ts';

const MARK = `rp${Date.now().toString(36)}`;
const TODAY = '2026-11-18';

const admin = adminClient();
let ctx: Context;
const ids: string[] = [];

const name = (label: string) => `${MARK} ${label}`;

async function add(label: string, options: Parameters<typeof addTask>[2]) {
  const result = await addTask(ctx, name(label), options);
  ids.push(result.task.id);
  return result;
}

const show = (label: string) => showTask(ctx, name(label));

beforeAll(async () => {
  ctx = { scope: { db: admin, userId: await devUserId(admin) }, today: TODAY, now: '2026-11-18T19:00:00.000Z' };
});

afterAll(async () => {
  if (ids.length) await admin.from('tasks').delete().in('id', ids);
});

describe('schedule, after completion and dates', () => {
  it('advances a weekly schedule, keeps the flag, resets subtasks and clears the board position', async () => {
    await add('weekly', { due: '2026-11-18', flag: true, subtasks: ['Pack the bag'], repeat: { repeat: 'weekly', startOffset: '1' } });
    await editTask(ctx, name('weekly'), { subtasks: { done: ['1'] } });
    const before = await show('weekly');
    expect(before.sortKey).toEqual(expect.any(String));
    expect(before.task.subtasks?.[0]?.done).toBe(true);

    const done = await doneTask(ctx, name('weekly'));
    expect(done.note).toBe('Next due 2026-11-25');
    const after = await show('weekly');
    expect(after.task.dueDate).toBe('2026-11-25');
    expect(after.task.startDate).toBe('2026-11-24');
    expect(after.task.status).toBe('open');
    expect(after.task.flagged).toBe(true);
    expect(after.task.completedAt).toBeNull();
    expect(after.task.subtasks?.[0]?.done).toBe(false);
    expect(after.sortKey).toBeNull();
    expect(after.placement).toBe('upcoming');

    const history = (await historyTask(ctx, name('weekly'))).filter(isOccurrenceHistory);
    expect(history.map((row) => [row.kind, row.occurrenceDue, row.completedOn])).toEqual([['done', '2026-11-18', TODAY]]);
    expect(history[0]).toMatchObject({ action: 'completed', label: 'Done', undoable: true, effect: { outcome: 'advance', dueDate: '2026-11-25', completedOn: null } });

    await undoneTask(ctx, name('weekly'));
    const restored = await show('weekly');
    expect(restored.task.dueDate).toBe('2026-11-18');
    expect(restored.task.startDate).toBe('2026-11-17');
    expect(restored.task.subtasks?.[0]?.done).toBe(true);
    expect(restored.sortKey).toBe(before.sortKey);
    expect((await historyTask(ctx, name('weekly'))).filter(isOccurrenceHistory)).toEqual([]);
  });

  it('counts a completion from the day it was done, including when that day is --on', async () => {
    await add('after', { due: '2026-11-18', repeat: { repeat: 'daily', mode: 'after_completion', interval: '2' } });
    expect((await doneTask(ctx, name('after'))).task.dueDate).toBe('2026-11-20');
    await undoneTask(ctx, name('after'));
    expect((await doneTask(ctx, name('after'), '2026-11-20')).task.dueDate).toBe('2026-11-22');
  });

  it('uses --today when --on is left off, and catches a schedule up to that day', async () => {
    await add('today', { due: '2026-11-18', repeat: { repeat: 'daily' } });
    const later: Context = { ...ctx, today: '2026-11-20' };
    expect((await doneTask(later, name('today'))).task.dueDate).toBe('2026-11-20');
    await undoneTask(ctx, name('today'));
    expect((await doneTask(ctx, name('today'), '2026-11-20')).task.dueDate).toBe('2026-11-20');
  });

  it('skips an occurrence without completing the task, and a skip counts toward Ends', async () => {
    await add('skip', { due: '2026-11-18', repeat: { repeat: 'daily', ends: 'count:2' } });
    expect((await skipTask(ctx, name('skip'))).task.dueDate).toBe('2026-11-19');
    expect((await show('skip')).task.completedAt).toBeNull();
    const ended = await skipTask(ctx, name('skip'));
    expect(ended.note).toBe('Repeat ended');
    expect(ended.task.completedAt).toBe(ctx.now);
    expect(ended.task.dueDate).toBe('2026-11-19');
    const history = (await historyTask(ctx, name('skip'))).filter(isOccurrenceHistory);
    expect(history.map((row) => row.kind)).toEqual(['skip', 'skip']);
    expect(history.map((row) => row.effect.outcome)).toEqual(['advance', 'end']);
  });

  it('refuses to skip an occurrence that was already skipped', async () => {
    await add('once', { due: '2026-11-18', repeat: { repeat: 'daily' } });
    await skipTask(ctx, name('once'));
    await editTask(ctx, name('once'), { due: '2026-11-18' });
    await expect(skipTask(ctx, name('once'))).rejects.toThrow(/already skipped/);
    const shown = await show('once');
    expect(shown.task.dueDate).toBe('2026-11-18');
    expect(shown.task.completedAt).toBeNull();
    expect((await historyTask(ctx, name('once'))).filter(isOccurrenceHistory)).toHaveLength(1);
  });

  it('ends a dates list when nothing is left, and an on-date is included', async () => {
    await add('dates', { due: '2026-11-18', repeat: { mode: 'dates', dates: '2026-11-18,2026-12-01' } });
    expect((await doneTask(ctx, name('dates'))).task.dueDate).toBe('2026-12-01');
    const ended = await doneTask(ctx, name('dates'));
    expect(ended.task.completedAt).not.toBeNull();
    expect(ended.task.dueDate).toBe('2026-12-01');

    await add('until', { due: '2026-11-18', repeat: { repeat: 'daily', ends: '2026-11-19' } });
    expect((await doneTask(ctx, name('until'))).task.dueDate).toBe('2026-11-19');
    expect((await doneTask(ctx, name('until'))).task.completedAt).not.toBeNull();
    expect((await show('until')).task.dueDate).toBe('2026-11-19');
  });

  it('does the monthly nth weekday, the last day, and a Feb 29 yearly', async () => {
    await add('nth', { due: '2026-11-10', repeat: { repeat: 'monthly', monthly: '2nd tue' } });
    expect((await doneTask(ctx, name('nth'))).task.dueDate).toBe('2026-12-08');

    await add('last', { due: '2026-01-31', repeat: { repeat: 'monthly', monthly: 'last' } });
    expect((await doneTask({ ...ctx, today: '2026-02-01' }, name('last'))).task.dueDate).toBe('2026-02-28');

    await add('leap', { due: '2024-02-29', repeat: { repeat: 'yearly' } });
    expect((await doneTask(ctx, name('leap'))).task.dueDate).toBe('2027-02-28');
  });

  it('steps weekdays past the weekend, and a Monday week, not a Sunday one', async () => {
    await add('weekdays', { due: '2026-11-20', repeat: { repeat: 'weekdays' } });
    expect((await doneTask({ ...ctx, today: '2026-11-20' }, name('weekdays'))).task.dueDate).toBe('2026-11-23');

    await add('fortnight', { due: '2026-11-15', repeat: { repeat: 'weekly', interval: '2', byWeekday: 'mon' } });
    expect((await doneTask({ ...ctx, today: '2026-11-15' }, name('fortnight'))).task.dueDate).toBe('2026-11-23');
  });

  it('ends a wait on the next occurrence and refuses undo after an edit', async () => {
    await add('wait', { due: '2026-11-18', status: 'waiting', hideUntil: '2026-11-20', repeat: { repeat: 'daily' } });
    const next = await doneTask(ctx, name('wait'));
    expect(next.task.status).toBe('open');
    expect(next.task.hideUntil).toBeNull();
    expect(next.task.dueDate).toBe('2026-11-19');

    await add('edited', { due: '2026-11-18', repeat: { repeat: 'daily' } });
    await doneTask(ctx, name('edited'));
    await editTask(ctx, name('edited'), { title: name('edited renamed') });
    await expect(undoneTask(ctx, name('edited renamed'))).rejects.toThrow(/edited since/);
  });

  it('round-trips the rule and the history in a backup', async () => {
    await add('backup', { due: '2026-11-18', repeat: { repeat: 'daily', startOffset: '0' } });
    await skipTask(ctx, name('backup'));
    const backup = await exportAll(ctx.scope);
    const mine = backup.tasks.find((t) => t.title === name('backup'))!;
    const history = (backup.completions ?? []).filter((c) => c.task_id === mine.id);
    expect(mine.repeat).toMatchObject({ mode: 'schedule', freq: 'daily', interval: 1, startOffsetDays: 0 });
    expect(history.map((row) => [row.kind, row.occurrence_due])).toEqual([['skip', '2026-11-18']]);
    expect((await show('backup')).task.dueDate).toBe('2026-11-19');

    await admin.from('tasks').delete().eq('id', mine.id);
    const imported = await importAll(ctx.scope, { ...backup, tasks: [mine], positions: [], subtasks: [], tags: [], task_tags: [], completions: history }, false);
    expect(imported.completions).toBe(1);
    const back = await show('backup');
    expect(back.task.dueDate).toBe('2026-11-19');
    expect(back.task.startDate).toBe('2026-11-19');
    expect((await historyTask(ctx, name('backup'))).filter(isOccurrenceHistory)).toHaveLength(1);
  });
});

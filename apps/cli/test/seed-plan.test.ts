import { readFileSync } from 'node:fs';
import { buildBoard, placementFor, weekdayOf, type Task } from '@app/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED_FILE } from '../src/config.ts';
import { taskFromRow, type TaskRow } from '@app/data';
import { planSeed, type SeedFile } from '../src/seed-plan.ts';

const file = JSON.parse(readFileSync(DEFAULT_SEED_FILE, 'utf8')) as SeedFile;

/** CI's pinned days: a Wednesday and a Saturday. */
const PINNED = [
  { today: '2026-11-18', weekday: 'Wednesday' },
  { today: '2026-11-21', weekday: 'Saturday' },
];

function plan(today: string) {
  let n = 0;
  return planSeed(file, today, {
    userId: 'user',
    now: new Date('2026-01-01T00:00:00Z'),
    newId: () => `t${String(n++).padStart(3, '0')}`,
  });
}

describe.each(PINNED)('seed/tasks.json on $weekday $today', ({ today }) => {
  const seeded = plan(today);
  const tasks = seeded.tasks.map((row) => taskFromRow({ ...row, updated_at: '' } as TaskRow));

  it('places every task where its hand-written expect says', () => {
    const actual = tasks.map((t) => ({ title: t.title, placement: placementFor(t, today) }));
    expect(actual).toEqual(file.tasks.map((t) => ({ title: t.title, placement: t.expect })));
  });

  it('positions every task except Upcoming ones (a future start date), in file order', () => {
    const upcomingIds = new Set(tasks.filter((t) => t.startDate && t.startDate > today).map((t) => t.id));
    expect(seeded.positions.map((p) => p.task_id)).toEqual(tasks.filter((t) => !upcomingIds.has(t.id)).map((t) => t.id));
  });

  it('keeps file order within each manually ordered section', () => {
    const board = buildBoard(tasks, new Map(seeded.positions.map((p) => [p.task_id, p.sort_key])), today, {});
    const fileIndex = new Map(tasks.map((t, i) => [t.id, i]));
    for (const section of board.sections.filter((s) => s.id !== 'upcoming')) {
      const order = section.tasks.map((t: Task) => fileIndex.get(t.id)!);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('stores each repeat and still applies its date effects', () => {
    const byTitle = new Map(tasks.map((t) => [t.title, t]));
    const garbage = byTitle.get('Take out garbage')!;
    expect(garbage.startDate).toBe(today);
    expect(garbage.repeat).toMatchObject({ mode: 'schedule', freq: 'weekly', interval: 1, startOffsetDays: 1 });
    const standUp = byTitle.get('Stand-up notes')!;
    expect(['sat', 'sun']).not.toContain(weekdayOf(standUp.dueDate!));
    expect(standUp.repeat).toMatchObject({ mode: 'schedule', byWeekday: ['mon', 'tue', 'wed', 'thu', 'fri'] });
    const taxes = byTitle.get('Pay estimated quarterly taxes')!;
    expect(taxes.repeat?.mode).toBe('dates');
    expect(taxes.repeat?.dates?.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))).toBe(true);
    expect(tasks.filter((t) => t.repeat).map((t) => t.repeat!.mode).sort()).toEqual(['after_completion', 'after_completion', 'dates', 'schedule', 'schedule', 'schedule', 'schedule', 'schedule', 'schedule']);
    expect(seeded.skipped).toEqual({});
  });
});

it('moves Stand-up notes from Saturday to Monday', () => {
  const standUp = plan('2026-11-21').tasks.find((t) => t.title === 'Stand-up notes')!;
  expect(standUp.due_date).toBe('2026-11-23');
});

it('moves a start-tomorrow task to the bottom of Ready the next day', () => {
  const today = '2026-11-18';
  const seeded = plan(today);
  const tasks = seeded.tasks.map((row) => taskFromRow({ ...row, updated_at: '' } as TaskRow));
  const board = buildBoard(tasks, new Map(seeded.positions.map((p) => [p.task_id, p.sort_key])), '2026-11-19', {});
  const ready = board.sections.find((s) => s.id === 'ready')!.tasks;
  expect(ready.at(-1)!.title).toBe('Book flights for spring break');
});

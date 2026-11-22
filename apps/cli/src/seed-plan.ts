import {
  addDays,
  nextWeekdayOnOrAfter,
  resolveDate,
  sortKeysAfter,
  validateTask,
  type ISODate,
  type Placement,
  type Status,
  type Weekday,
} from '@app/core';
import type { TaskRow } from '@app/data';

export interface SeedRepeat {
  mode: 'schedule' | 'after_completion' | 'dates';
  freq?: string;
  interval?: number;
  byWeekday?: Weekday[];
  dates?: string[];
  startOffsetDays?: number;
}

export interface SeedTask {
  expect: Placement;
  afterPurge?: 'kept' | 'removed';
  title: string;
  description?: string;
  status?: Status;
  start?: string;
  hideUntil?: string;
  due?: string;
  flagged?: boolean;
  completed?: string;
  deleted?: string;
  tags?: string[];
  subtasks?: { title: string; done: boolean }[];
  repeat?: SeedRepeat;
}

export interface SeedFile {
  version: number;
  tags?: string[];
  tasks: SeedTask[];
}

export type NewTaskRow = Omit<TaskRow, 'updated_at'>;

export interface SeedPlan {
  today: ISODate;
  tasks: NewTaskRow[];
  positions: { task_id: string; sort_key: string }[];
  /** Fields left out because their feature isn't built yet; counts of seed tasks that had them. */
  skipped: { tags: number; subtasks: number; repeat: number };
}

/** Noon UTC on the given day, which is the same calendar day in nearly every time zone. */
function middayOf(date: ISODate): string {
  return `${date}T12:00:00.000Z`;
}

export interface PlanOptions {
  userId: string;
  /** Real time for created_at; staggered by file order so ties sort the same way every time. */
  now?: Date;
  newId?: () => string;
}

/**
 * Turns a seed file into rows, with dates resolved against `today`.
 * Repeats aren't stored until Phase 2, but their date effects are applied:
 * the due date moves to the next byWeekday day, and startOffsetDays sets the start date.
 */
export function planSeed(file: SeedFile, today: ISODate, options: PlanOptions): SeedPlan {
  const now = options.now ?? new Date();
  const newId = options.newId ?? (() => crypto.randomUUID());
  const skipped = { tags: 0, subtasks: 0, repeat: 0 };
  const tasks: NewTaskRow[] = [];
  const positioned: string[] = [];

  file.tasks.forEach((seed, index) => {
    let due = seed.due ? resolveDate(seed.due, today) : null;
    if (due && seed.repeat?.byWeekday?.length) due = nextWeekdayOnOrAfter(due, seed.repeat.byWeekday);
    let start = seed.start ? resolveDate(seed.start, today) : null;
    if (!start && due && seed.repeat?.startOffsetDays != null) start = addDays(due, -seed.repeat.startOffsetDays);
    const hideUntil = seed.hideUntil ? resolveDate(seed.hideUntil, today) : null;

    const completedOn = seed.completed ? resolveDate(seed.completed, today) : null;
    const deletedOn = seed.deleted ? resolveDate(seed.deleted, today) : null;

    const row: NewTaskRow = {
      id: newId(),
      user_id: options.userId,
      title: seed.title,
      description: seed.description ?? '',
      status: seed.status ?? 'open',
      flagged: seed.flagged ?? false,
      start_date: start,
      hide_until: hideUntil,
      due_date: due,
      repeat: null,
      completed_at: completedOn ? middayOf(completedOn) : null,
      completed_on: completedOn,
      deleted_at: deletedOn ? middayOf(deletedOn) : null,
      deleted_on: deletedOn,
      created_at: new Date(now.getTime() + index).toISOString(),
    };

    const issues = validateTask({
      title: row.title,
      status: row.status,
      startDate: row.start_date,
      hideUntil: row.hide_until,
      dueDate: row.due_date,
      completedAt: row.completed_at,
      completedOn: row.completed_on,
      deletedAt: row.deleted_at,
      deletedOn: row.deleted_on,
    });
    if (issues.length > 0) {
      throw new Error(`Seed task "${seed.title}": ${issues.map((i) => `${i.field}: ${i.message}`).join('; ')}`);
    }

    if (seed.tags?.length) skipped.tags++;
    if (seed.subtasks?.length) skipped.subtasks++;
    if (seed.repeat) skipped.repeat++;

    tasks.push(row);
    // A future start date means no stored position: Upcoming sorts by start date,
    // and the task lands at the bottom of Ready when its day comes.
    if (!(start && start > today)) positioned.push(row.id);
  });

  const keys = sortKeysAfter(positioned.length);
  const positions = positioned.map((task_id, i) => ({ task_id, sort_key: keys[i]! }));
  return { today, tasks, positions, skipped };
}

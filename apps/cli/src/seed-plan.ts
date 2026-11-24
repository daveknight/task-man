import {
  addDays,
  checkTagName,
  findTagByName,
  nextWeekdayOnOrAfter,
  resolveDate,
  sortKeysAfter,
  validateRepeat,
  validateTask,
  type ISODate,
  type Placement,
  type RepeatEnds,
  type RepeatFreq,
  type RepeatRule,
  type Status,
  type Weekday,
} from '@app/core';
import type { SubtaskRow, TagRow, TaskRow, TaskTagRow } from '@app/data';

export interface SeedRepeat {
  mode: RepeatRule['mode'];
  freq?: string;
  interval?: number;
  byWeekday?: Weekday[];
  monthly?: RepeatRule['monthly'];
  /** Absolute or relative dates. Resolved against today before they're stored. */
  dates?: string[];
  ends?: { never: true } | { onDate: string } | { afterCount: number };
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
export type NewSubtaskRow = Omit<SubtaskRow, 'created_at' | 'updated_at'>;
export type NewTagRow = Omit<TagRow, 'created_at' | 'updated_at'>;
export type NewTaskTagRow = Required<TaskTagRow>;

export interface SeedPlan {
  today: ISODate;
  tasks: NewTaskRow[];
  subtasks: NewSubtaskRow[];
  tags: NewTagRow[];
  taskTags: NewTaskTagRow[];
  positions: { task_id: string; sort_key: string }[];
  /** Fields left out because their feature isn't built yet. Empty once everything in the file is stored. */
  skipped: Record<string, number>;
}

/** The seed's repeat, with relative dates resolved, checked by the same rules as a write. */
function repeatFromSeed(seed: SeedRepeat, today: ISODate): RepeatRule {
  const rule: RepeatRule = { mode: seed.mode };
  if (seed.freq) rule.freq = seed.freq as RepeatFreq;
  if (seed.interval != null) rule.interval = seed.interval;
  if (seed.byWeekday?.length) rule.byWeekday = [...seed.byWeekday];
  if (seed.monthly) rule.monthly = seed.monthly;
  if (seed.dates?.length) rule.dates = seed.dates.map((date) => resolveDate(date, today));
  if (seed.ends) {
    rule.ends = 'onDate' in seed.ends ? { onDate: resolveDate(seed.ends.onDate, today) } : (seed.ends as RepeatEnds);
  }
  if (seed.startOffsetDays != null) rule.startOffsetDays = seed.startOffsetDays;
  const issues = validateRepeat(rule);
  if (issues.length > 0) throw new Error(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
  return rule;
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
 * Subtasks are stored in file order, and so are a task's tags (each link is a millisecond after the last, which is how chips keep their order).
 * Repeats are stored too. Their date effects are applied first: the due date moves to the next byWeekday day, and startOffsetDays sets the start date.
 */
export function planSeed(file: SeedFile, today: ISODate, options: PlanOptions): SeedPlan {
  const now = options.now ?? new Date();
  const newId = options.newId ?? (() => crypto.randomUUID());
  const skipped: Record<string, number> = {};
  const tasks: NewTaskRow[] = [];
  const subtasks: NewSubtaskRow[] = [];
  const tags: NewTagRow[] = [];
  const taskTags: NewTaskTagRow[] = [];
  const tagFor = (name: string): NewTagRow => {
    const existing = findTagByName(tags, name);
    if (existing) return existing;
    const checked = checkTagName(name, tags);
    if (!checked.ok) throw new Error(`Seed tag "${name}": ${checked.message}`);
    const row = { id: newId(), user_id: options.userId, name: checked.name };
    tags.push(row);
    return row;
  };
  for (const name of file.tags ?? []) tagFor(name);
  const positioned: string[] = [];

  file.tasks.forEach((seed, index) => {
    let due = seed.due ? resolveDate(seed.due, today) : null;
    if (due && seed.repeat?.byWeekday?.length) due = nextWeekdayOnOrAfter(due, seed.repeat.byWeekday);
    let start = seed.start ? resolveDate(seed.start, today) : null;
    if (!start && due && seed.repeat?.startOffsetDays != null) start = addDays(due, -seed.repeat.startOffsetDays);
    const hideUntil = seed.hideUntil ? resolveDate(seed.hideUntil, today) : null;

    const completedOn = seed.completed ? resolveDate(seed.completed, today) : null;
    const deletedOn = seed.deleted ? resolveDate(seed.deleted, today) : null;

    let repeat: RepeatRule | null = null;
    if (seed.repeat) {
      try {
        repeat = repeatFromSeed(seed.repeat, today);
      } catch (error) {
        throw new Error(`Seed task "${seed.title}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }

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
      repeat,
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
      repeat,
    });
    if (issues.length > 0) {
      throw new Error(`Seed task "${seed.title}": ${issues.map((i) => `${i.field}: ${i.message}`).join('; ')}`);
    }

    (seed.tags ?? []).forEach((name, i) => {
      const tag = tagFor(name);
      if (taskTags.some((l) => l.task_id === row.id && l.tag_id === tag.id)) return;
      taskTags.push({ user_id: options.userId, task_id: row.id, tag_id: tag.id, created_at: new Date(now.getTime() + i).toISOString() });
    });
    const keys = sortKeysAfter(seed.subtasks?.length ?? 0);
    (seed.subtasks ?? []).forEach((subtask, i) => {
      subtasks.push({ id: newId(), user_id: options.userId, task_id: row.id, title: subtask.title, done: subtask.done, sort_key: keys[i]! });
    });
    tasks.push(row);
    // A future start date means no stored position: Upcoming sorts by start date,
    // and the task lands at the bottom of Ready when its day comes.
    if (!(start && start > today)) positioned.push(row.id);
  });

  const keys = sortKeysAfter(positioned.length);
  const positions = positioned.map((task_id, i) => ({ task_id, sort_key: keys[i]! }));
  return { today, tasks, subtasks, tags, taskTags, positions, skipped };
}

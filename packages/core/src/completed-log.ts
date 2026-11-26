import { addDays, weekdayOf } from './dates.ts';
import type { ISODate, Task, Weekday } from './types.ts';

/** Monday is 0. Weeks start on Monday, matching `Weekday`. */
const WEEK_INDEX: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

/** Monday of the week that contains `date`. */
export function startOfWeek(date: ISODate): ISODate {
  return addDays(date, -WEEK_INDEX[weekdayOf(date)]);
}

/**
 * One finished item in the completed log.
 * `task` is a one-off completion (the task's own completed-on day).
 * `occurrence` is one recorded completion of a repeating task. Skips are not finishes, so they are left out.
 */
export interface CompletedLogEntry {
  /** The task id for a one-off, or the completion row id for an occurrence. */
  id: string;
  taskId: string;
  /** The task's current title, so a rename shows up here. */
  title: string;
  source: 'task' | 'occurrence';
  completedOn: ISODate;
  completedAt: string;
  /** The due date of that occurrence. Null for a one-off finish. */
  occurrenceDue: ISODate | null;
}

export interface CompletedLogDay {
  date: ISODate;
  /** Newest completion first. The same timestamp keeps the smaller id first. */
  entries: CompletedLogEntry[];
}

export interface CompletedLogWeek {
  /** Monday. */
  start: ISODate;
  /** Sunday. */
  end: ISODate;
  /** Only the newest week starts open. Older weeks start collapsed. */
  collapsedByDefault: boolean;
  /** Newest day first. Days with nothing finished are left out. */
  days: CompletedLogDay[];
  count: number;
}

export interface CompletedLog {
  today: ISODate;
  /** Newest week first. A week with nothing finished is left out. */
  weeks: CompletedLogWeek[];
}

/** The fields the log reads off a completion row. `OccurrenceRecord` satisfies this. */
export interface CompletedLogRecord {
  id: string;
  taskId: string;
  kind: 'done' | 'skip';
  completedOn: ISODate;
  completedAt: string;
  occurrenceDue: ISODate;
}

function compareNewest(a: { completedAt: string; id: string }, b: { completedAt: string; id: string }): number {
  return a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareDateDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

/**
 * The "what I finished" view: every one-off completion and every recorded completion of a repeating
 * task, grouped into Monday-start weeks and then days. Newest first. Read-only: it changes nothing.
 *
 * A task in Trash is left out, and so is its history. A repeating task that has finished for good is
 * listed once, from its completion row, not again from `completedOn`. A completion with no
 * `completedOn` is left out rather than guessed from the timestamp. Skips are left out.
 */
export function buildCompletedLog(tasks: readonly Task[], completions: readonly CompletedLogRecord[], today: ISODate): CompletedLog {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const recorded = new Set<string>();
  const entries: CompletedLogEntry[] = [];

  for (const record of completions) {
    if (record.kind !== 'done') continue;
    const task = byId.get(record.taskId);
    if (!task || task.deletedAt || !record.completedOn) continue;
    recorded.add(task.id);
    entries.push({
      id: record.id,
      taskId: task.id,
      title: task.title,
      source: 'occurrence',
      completedOn: record.completedOn,
      completedAt: record.completedAt,
      occurrenceDue: record.occurrenceDue,
    });
  }

  for (const task of tasks) {
    if (task.deletedAt || !task.completedAt || !task.completedOn || recorded.has(task.id)) continue;
    entries.push({
      id: task.id,
      taskId: task.id,
      title: task.title,
      source: 'task',
      completedOn: task.completedOn,
      completedAt: task.completedAt,
      occurrenceDue: null,
    });
  }

  const byWeek = new Map<string, Map<string, CompletedLogEntry[]>>();
  for (const entry of entries) {
    const start = startOfWeek(entry.completedOn);
    const days = byWeek.get(start) ?? new Map<string, CompletedLogEntry[]>();
    const list = days.get(entry.completedOn) ?? [];
    list.push(entry);
    days.set(entry.completedOn, list);
    byWeek.set(start, days);
  }

  const weeks = [...byWeek.keys()].sort(compareDateDesc).map((start, index): CompletedLogWeek => {
    const days = byWeek.get(start)!;
    const dayList = [...days.keys()].sort(compareDateDesc).map((date): CompletedLogDay => ({
      date,
      entries: days.get(date)!.sort(compareNewest),
    }));
    return {
      start,
      end: addDays(start, 6),
      collapsedByDefault: index !== 0,
      days: dayList,
      count: dayList.reduce((sum, day) => sum + day.entries.length, 0),
    };
  });

  return { today, weeks };
}

import { addDays, addMonths, daysInMonth, isValidDate, weekdayOf } from './dates.ts';
import { resetSubtasks } from './subtasks.ts';
import type { ISODate, RepeatEnds, RepeatFreq, RepeatMode, RepeatRule, Status, Subtask, Task, Weekday } from './types.ts';
import type { ValidationIssue } from './validate.ts';

export const REPEAT_MODES: readonly RepeatMode[] = ['schedule', 'after_completion', 'dates'];
export const REPEAT_FREQS: readonly RepeatFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];

/** Monday is 0. Weeks start on Monday. */
const WEEKDAY_INDEX: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const issue = (field: string, message: string): ValidationIssue => ({ field, message });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function whole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function daysBetween(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function mondayOf(date: ISODate): ISODate {
  return addDays(date, -WEEKDAY_INDEX[weekdayOf(date)]);
}

function later(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

function ymd(date: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

function fromYMD(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The last `weekday` of a month, or the 1st–4th one. */
function nthWeekdayOfMonth(year: number, month: number, nth: number, weekday: Weekday): ISODate {
  if (nth === -1) {
    const last = fromYMD(year, month, daysInMonth(year, month));
    const back = (WEEKDAY_INDEX[weekdayOf(last)] - WEEKDAY_INDEX[weekday] + 7) % 7;
    return addDays(last, -back);
  }
  const first = fromYMD(year, month, 1);
  const forward = (WEEKDAY_INDEX[weekday] - WEEKDAY_INDEX[weekdayOf(first)] + 7) % 7;
  const day = 1 + forward + (nth - 1) * 7;
  if (day > daysInMonth(year, month)) throw new Error(`No ${nth} ${weekday} in ${year}-${String(month).padStart(2, '0')}`);
  return fromYMD(year, month, day);
}

function monthDate(year: number, month: number, rule: RepeatRule, fallbackDay: number): ISODate {
  const monthly = rule.monthly;
  if (!monthly) return fromYMD(year, month, Math.min(fallbackDay, daysInMonth(year, month)));
  if ('day' in monthly) {
    if (monthly.day === -1) return fromYMD(year, month, daysInMonth(year, month));
    return fromYMD(year, month, Math.min(monthly.day, daysInMonth(year, month)));
  }
  return nthWeekdayOfMonth(year, month, monthly.nth, monthly.weekday);
}

function addFreq(date: ISODate, freq: RepeatFreq, interval: number): ISODate {
  switch (freq) {
    case 'daily':
      return addDays(date, interval);
    case 'weekly':
      return addDays(date, 7 * interval);
    case 'monthly':
      return addMonths(date, interval);
    case 'yearly':
      return addMonths(date, interval * 12);
  }
}

function checkEnds(ends: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(ends)) {
    issues.push(issue('ends', 'Ends must be never, onDate or afterCount'));
    return;
  }
  const keys = Object.keys(ends);
  const kind = keys.length === 1 ? keys[0] : undefined;
  if (kind === 'never') {
    if (ends.never !== true) issues.push(issue('ends', 'ends.never must be true'));
    return;
  }
  if (kind === 'onDate') {
    if (!isValidDate(ends.onDate)) issues.push(issue('ends', `Not a valid date: ${JSON.stringify(ends.onDate)}`));
    return;
  }
  if (kind === 'afterCount') {
    if (!whole(ends.afterCount) || ends.afterCount < 1) issues.push(issue('ends', 'ends.afterCount must be a whole number of at least 1'));
    return;
  }
  issues.push(issue('ends', 'Ends is never, a date (onDate) or a count (afterCount), and only one of them'));
}

function checkMonthly(monthly: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(monthly)) {
    issues.push(issue('monthly', 'Monthly is a day of the month or an nth weekday'));
    return;
  }
  const keys = Object.keys(monthly);
  if (keys.length === 1 && keys[0] === 'day') {
    if (!whole(monthly.day) || monthly.day === 0 || monthly.day < -1 || monthly.day > 31) {
      issues.push(issue('monthly', 'monthly.day is 1–31, or -1 for the last day'));
    }
    return;
  }
  if (keys.length === 2 && keys.includes('nth') && keys.includes('weekday')) {
    if (!whole(monthly.nth) || !([1, 2, 3, 4, -1] as number[]).includes(monthly.nth as number)) {
      issues.push(issue('monthly', 'monthly.nth is 1–4, or -1 for the last'));
    }
    if (!WEEKDAYS.includes(monthly.weekday as Weekday)) issues.push(issue('monthly', `Unknown weekday ${JSON.stringify(monthly.weekday)}`));
    return;
  }
  issues.push(issue('monthly', 'Monthly is { day } or { nth, weekday }, and not both'));
}

function checkWeekdays(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(issue('byWeekday', 'byWeekday needs at least one weekday'));
    return;
  }
  const seen = new Set<string>();
  for (const day of value) {
    if (!WEEKDAYS.includes(day as Weekday)) issues.push(issue('byWeekday', `Unknown weekday ${JSON.stringify(day)}`));
    else if (seen.has(day)) issues.push(issue('byWeekday', `Weekday ${day} is listed twice`));
    seen.add(String(day));
  }
}

function checkDates(value: unknown, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(issue('dates', 'dates needs at least one date'));
    return;
  }
  const seen = new Set<string>();
  for (const date of value) {
    if (!isValidDate(date)) issues.push(issue('dates', `Not a valid date: ${JSON.stringify(date)}`));
    else if (seen.has(date)) issues.push(issue('dates', `Date ${date} is listed twice`));
    else seen.add(date);
  }
}

/**
 * Checks a repeat rule. A mode rejects fields it doesn't use: after-completion is only
 * `freq` and `interval` (plus ends and the start offset), dates mode is only `dates`,
 * and schedule uses `byWeekday` for weekly and `monthly` for monthly.
 */
export function validateRepeat(rule: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(rule)) return [issue('repeat', 'Repeat must be an object')];
  const mode = rule.mode;
  if (!REPEAT_MODES.includes(mode as RepeatMode)) {
    issues.push(issue('mode', `Unknown repeat mode ${JSON.stringify(mode)}`));
    return issues;
  }
  const keys = Object.keys(rule);
  const base = ['mode', 'ends', 'startOffsetDays'];
  const allowed =
    mode === 'dates'
      ? [...base, 'dates']
      : mode === 'after_completion'
        ? [...base, 'freq', 'interval']
        : [...base, 'freq', 'interval', ...(rule.freq === 'weekly' ? ['byWeekday'] : []), ...(rule.freq === 'monthly' ? ['monthly'] : [])];
  for (const key of keys) {
    if (!allowed.includes(key)) issues.push(issue(key, `${key} doesn't apply to ${mode}${mode === 'schedule' && rule.freq ? ` ${String(rule.freq)}` : ''}`));
  }
  if (mode !== 'dates') {
    if (!REPEAT_FREQS.includes(rule.freq as RepeatFreq)) issues.push(issue('freq', `Unknown frequency ${JSON.stringify(rule.freq)}`));
    if (!whole(rule.interval) || (rule.interval as number) < 1) issues.push(issue('interval', 'interval must be a whole number of at least 1'));
  }
  if (keys.includes('byWeekday')) checkWeekdays(rule.byWeekday, issues);
  if (keys.includes('monthly')) checkMonthly(rule.monthly, issues);
  if (keys.includes('dates')) checkDates(rule.dates, issues);
  if (keys.includes('ends')) checkEnds(rule.ends, issues);
  if (keys.includes('startOffsetDays') && (!whole(rule.startOffsetDays) || (rule.startOffsetDays as number) < 0)) {
    issues.push(issue('startOffsetDays', 'startOffsetDays must be a whole number of at least 0'));
  }
  return issues;
}

export function assertRepeat(rule: RepeatRule): void {
  const issues = validateRepeat(rule);
  if (issues.length > 0) throw new Error(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
}

/**
 * The next due date, strictly after `due`, and on or after `on` when the mode catches up
 * (schedule and dates). Null when a dates list has nothing left. After-completion counts
 * from `on` and then steps until the result is after `due`.
 */
export function nextDueDate(rule: RepeatRule, due: ISODate, on: ISODate): ISODate | null {
  assertRepeat(rule);
  if (!isValidDate(due)) throw new Error(`Not a valid date: ${JSON.stringify(due)}`);
  if (!isValidDate(on)) throw new Error(`Not a valid date: ${JSON.stringify(on)}`);
  if (rule.mode === 'dates') {
    const found = [...(rule.dates ?? [])].sort().find((date) => date > due && date >= on);
    return found ?? null;
  }
  if (rule.mode === 'after_completion') return nextAfterCompletion(rule, due, on);
  return nextSchedule(rule, due, on);
}

function nextAfterCompletion(rule: RepeatRule, due: ISODate, on: ISODate): ISODate {
  const freq = rule.freq!;
  const interval = rule.interval!;
  let next = addFreq(on, freq, interval);
  for (let i = 0; i < 10000 && next <= due; i++) next = addFreq(next, freq, interval);
  if (next <= due) throw new Error('No next due date');
  return next;
}

function nextSchedule(rule: RepeatRule, due: ISODate, on: ISODate): ISODate {
  const min = later(addDays(due, 1), on);
  switch (rule.freq) {
    case 'daily':
      return stepTo(addDays(due, rule.interval!), rule.interval!, min);
    case 'weekly':
      return nextWeekly(rule, due, min);
    case 'monthly':
      return nextMonthly(rule, due, min);
    case 'yearly':
      return nextYearly(rule, due, min);
    default:
      throw new Error(`Unknown frequency ${JSON.stringify(rule.freq)}`);
  }
}

/** `first` is on the grid; return the first grid point on or after `min`. */
function stepTo(first: ISODate, stepDays: number, min: ISODate): ISODate {
  if (first >= min) return first;
  const jumps = Math.ceil(daysBetween(first, min) / stepDays);
  return addDays(first, jumps * stepDays);
}

function nextWeekly(rule: RepeatRule, due: ISODate, min: ISODate): ISODate {
  const interval = rule.interval!;
  const days = [...(rule.byWeekday?.length ? rule.byWeekday : [weekdayOf(due)])].sort((a, b) => WEEKDAY_INDEX[a] - WEEKDAY_INDEX[b]);
  const anchor = mondayOf(due);
  const weeksToMin = Math.round(daysBetween(anchor, mondayOf(min)) / 7);
  let week = Math.max(0, weeksToMin);
  const mod = week % interval;
  if (mod !== 0) week += interval - mod;
  for (let i = 0; i < 5200; i++) {
    for (const day of days) {
      const date = addDays(anchor, week * 7 + WEEKDAY_INDEX[day]);
      if (date >= min) return date;
    }
    week += interval;
  }
  throw new Error('No next due date');
}

function nextMonthly(rule: RepeatRule, due: ISODate, min: ISODate): ISODate {
  const interval = rule.interval!;
  const dueY = ymd(due);
  const minY = ymd(min);
  const start = dueY.y * 12 + (dueY.m - 1);
  const rough = minY.y * 12 + (minY.m - 1) - start;
  let step = Math.max(0, rough - (((rough % interval) + interval) % interval));
  if (step >= interval) step -= interval;
  for (let i = 0; i < 4800; i++) {
    const index = start + step;
    const year = Math.floor(index / 12);
    const month = index - year * 12 + 1;
    const date = monthDate(year, month, rule, dueY.d);
    if (date > due && date >= min) return date;
    step += interval;
  }
  throw new Error('No next due date');
}

function nextYearly(rule: RepeatRule, due: ISODate, min: ISODate): ISODate {
  const interval = rule.interval!;
  const { y, m, d } = ymd(due);
  let year = y + interval;
  const minYear = ymd(min).y;
  if (minYear > year) year += Math.ceil((minYear - year) / interval) * interval;
  if (year - interval > y) year -= interval;
  for (let i = 0; i < 400; i++) {
    const date = fromYMD(year, m, Math.min(d, daysInMonth(year, m)));
    if (date > due && date >= min) return date;
    year += interval;
  }
  throw new Error('No next due date');
}

/** True when this completion or skip is the last one. `historyCount` excludes it. `next` null means the dates list ran out. */
export function seriesEnds(rule: RepeatRule, next: ISODate | null, historyCount: number): boolean {
  if (next == null) return true;
  const ends: RepeatEnds | undefined = rule.ends;
  if (!ends || 'never' in ends) return false;
  if ('onDate' in ends && next > ends.onDate) return true;
  if ('afterCount' in ends && historyCount + 1 >= ends.afterCount) return true;
  return false;
}

/** The start date for a due date: empty when the rule has no offset, and the due date itself when the offset is 0. */
export function startForDue(due: ISODate, rule: RepeatRule): ISODate | null {
  if (rule.startOffsetDays == null) return null;
  return addDays(due, -rule.startOffsetDays);
}

/** What an occurrence wrote, so undo can put the task back and can tell that it wasn't edited since. */
export interface OccurrenceSnapshot {
  title: string;
  description: string;
  status: Status;
  flagged: boolean;
  startDate: ISODate | null;
  hideUntil: ISODate | null;
  dueDate: ISODate | null;
  completedAt: string | null;
  completedOn: ISODate | null;
  deletedAt: string | null;
  deletedOn: ISODate | null;
  repeat: RepeatRule | null;
  subtasks: Subtask[];
  tagIds: string[];
  sortKey: string | null;
}

export interface OccurrenceRecord {
  id: string;
  taskId: string;
  occurrenceDue: ISODate;
  kind: 'done' | 'skip';
  completedOn: ISODate;
  completedAt: string;
  snapshot: OccurrenceSnapshot;
}

export type OccurrenceOutcome = 'advance' | 'end';

export interface OccurrencePlan {
  outcome: OccurrenceOutcome;
  task: Task;
  record: OccurrenceRecord;
  /** Subtasks that were done and must be cleared. Empty when the series ends. */
  resetSubtaskIds: string[];
  /** Advance drops the stored board position so the task arrives at the bottom of Ready, or in Upcoming. */
  clearPosition: boolean;
}

export interface OccurrenceInput {
  id: string;
  task: Task;
  kind: 'done' | 'skip';
  /** The local calendar day of the completion or skip. Schedule and dates catch up to this day. */
  on: ISODate;
  now: string;
  /** Completions and skips already stored, not including this one. */
  historyCount: number;
  sortKey: string | null;
  /**
   * Rows already stored. When present, an occurrence whose due date is already in this list
   * is refused, so the same occurrence can't be completed or skipped twice.
   */
  prior?: readonly OccurrenceRecord[];
}

export const OCCURRENCE_EDITED = "This task was edited since that occurrence, so it can't be undone";

export const OCCURRENCE_ALREADY_SKIPPED = 'This occurrence was already skipped';

export const OCCURRENCE_ALREADY_COMPLETED = 'This occurrence was already completed';

/** The database's unique key rejected a second write of an occurrence the caller hadn't seen yet. */
export const OCCURRENCE_ALREADY_RECORDED = 'This occurrence was already recorded';

/** Refuses a second completion or skip of the same due date. The stored row says which it was. */
export function assertOccurrenceOpen(records: readonly OccurrenceRecord[], taskId: string, due: ISODate | null | undefined): void {
  if (!due) return;
  const existing = records.find((record) => record.taskId === taskId && record.occurrenceDue === due);
  if (!existing) return;
  throw new Error(existing.kind === 'skip' ? OCCURRENCE_ALREADY_SKIPPED : OCCURRENCE_ALREADY_COMPLETED);
}

function snapshotOf(task: Task, sortKey: string | null): OccurrenceSnapshot {
  return {
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    flagged: !!task.flagged,
    startDate: task.startDate ?? null,
    hideUntil: task.hideUntil ?? null,
    dueDate: task.dueDate ?? null,
    completedAt: task.completedAt ?? null,
    completedOn: task.completedOn ?? null,
    deletedAt: task.deletedAt ?? null,
    deletedOn: task.deletedOn ?? null,
    repeat: task.repeat ?? null,
    subtasks: (task.subtasks ?? []).map((s) => ({ ...s })),
    tagIds: (task.tags ?? []).map((t) => t.id),
    sortKey,
  };
}

/**
 * Completing or skipping one occurrence. Advance moves the due date, recomputes the start
 * date, resets subtasks, returns the task to Open and clears its board position; the flag
 * stays. End (the repeat ran out, or Ends was reached) completes the task for good.
 */
export function planOccurrence(input: OccurrenceInput): OccurrencePlan {
  const { task, kind, on, now, historyCount, sortKey, id } = input;
  if (task.deletedAt) throw new Error("A task in Trash can't be completed or skipped");
  if (task.completedAt) throw new Error(`"${task.title}" is already completed`);
  if (!task.repeat) throw new Error("This task doesn't repeat");
  assertRepeat(task.repeat);
  if (!task.dueDate || !isValidDate(task.dueDate)) throw new Error('A repeat needs a due date');
  if (!isValidDate(on)) throw new Error(`Not a valid date: ${JSON.stringify(on)}`);
  if (!whole(historyCount) || historyCount < 0) throw new Error('historyCount must be a whole number of at least 0');
  if (input.prior) assertOccurrenceOpen(input.prior, task.id, task.dueDate);

  const next = nextDueDate(task.repeat, task.dueDate, on);
  const end = seriesEnds(task.repeat, next, historyCount);
  const record: OccurrenceRecord = {
    id,
    taskId: task.id,
    occurrenceDue: task.dueDate,
    kind,
    completedOn: on,
    completedAt: now,
    snapshot: snapshotOf(task, sortKey),
  };
  if (end) {
    return { outcome: 'end', task: { ...task, completedAt: now, completedOn: on }, record, resetSubtaskIds: [], clearPosition: false };
  }
  const dueDate = next!;
  return {
    outcome: 'advance',
    task: {
      ...task,
      status: 'open',
      dueDate,
      startDate: startForDue(dueDate, task.repeat),
      hideUntil: null,
      completedAt: null,
      completedOn: null,
      subtasks: resetSubtasks(task.subtasks),
    },
    record,
    resetSubtaskIds: (task.subtasks ?? []).filter((s) => s.done).map((s) => s.id),
    clearPosition: true,
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

export function sameRepeat(a: RepeatRule | null | undefined, b: RepeatRule | null | undefined): boolean {
  return stable(a ?? null) === stable(b ?? null);
}

function sameSubtasks(a: readonly Subtask[] | undefined, b: readonly Subtask[] | undefined): boolean {
  const sort = (list: readonly Subtask[] | undefined) => [...(list ?? [])].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const left = sort(a);
  const right = sort(b);
  return left.length === right.length && left.every((s, i) => s.id === right[i]!.id && s.title === right[i]!.title && s.done === right[i]!.done && s.sortKey === right[i]!.sortKey);
}

/** Timestamps round-trip through Postgres in a different shape (`+00:00` rather than `Z`). */
function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if ((a ?? null) === (b ?? null)) return true;
  if (!a || !b) return false;
  const left = Date.parse(a);
  const right = Date.parse(b);
  return !Number.isNaN(left) && left === right;
}

function sameTaskState(current: Task, expected: Task): boolean {
  const date = (value: ISODate | null | undefined) => value ?? null;
  return (
    current.title === expected.title &&
    (current.description ?? '') === (expected.description ?? '') &&
    current.status === expected.status &&
    !!current.flagged === !!expected.flagged &&
    date(current.startDate) === date(expected.startDate) &&
    date(current.hideUntil) === date(expected.hideUntil) &&
    date(current.dueDate) === date(expected.dueDate) &&
    sameInstant(current.completedAt, expected.completedAt) &&
    date(current.completedOn) === date(expected.completedOn) &&
    sameInstant(current.deletedAt, expected.deletedAt) &&
    date(current.deletedOn) === date(expected.deletedOn) &&
    sameRepeat(current.repeat, expected.repeat) &&
    sameSubtasks(current.subtasks, expected.subtasks) &&
    stable((current.tags ?? []).map((t) => t.id)) === stable((expected.tags ?? []).map((t) => t.id))
  );
}

function taskFromSnapshot(current: Task, snap: OccurrenceSnapshot): Task {
  const tags = current.tags ?? [];
  return {
    ...current,
    title: snap.title,
    description: snap.description,
    status: snap.status,
    flagged: snap.flagged,
    startDate: snap.startDate,
    hideUntil: snap.hideUntil,
    dueDate: snap.dueDate,
    completedAt: snap.completedAt,
    completedOn: snap.completedOn,
    deletedAt: snap.deletedAt,
    deletedOn: snap.deletedOn,
    repeat: snap.repeat,
    subtasks: snap.subtasks.map((s) => ({ ...s })),
    tags,
  };
}

export interface UndoPlan {
  task: Task;
  /** The position to write back. Null clears it. */
  sortKey: string | null;
  subtaskDone: { id: string; done: boolean }[];
  completionId: string;
}

/**
 * Restores the task from a completion snapshot. Refuses when the task isn't the one that
 * occurrence left behind (it was edited, or this isn't a replay of that same occurrence).
 * `historyCount` is the number of other history rows that existed when it was recorded.
 */
export function planUndoOccurrence(current: Task, record: OccurrenceRecord, historyCount: number, sortKey: string | null): UndoPlan {
  const snap = record.snapshot;
  if (!snap || snap.dueDate == null || snap.repeat == null) throw new Error('That occurrence has nothing to restore');
  const before = taskFromSnapshot(current, snap);
  const tagIds = (current.tags ?? []).map((t) => t.id);
  if (stable(tagIds) !== stable(snap.tagIds)) throw new Error(OCCURRENCE_EDITED);
  const planned = planOccurrence({
    id: record.id,
    task: before,
    kind: record.kind,
    on: record.completedOn,
    now: record.completedAt,
    historyCount,
    sortKey: snap.sortKey,
  });
  const expectedKey = planned.outcome === 'advance' ? null : snap.sortKey;
  if (record.occurrenceDue !== snap.dueDate || !sameTaskState(current, planned.task) || (sortKey ?? null) !== expectedKey) {
    throw new Error(OCCURRENCE_EDITED);
  }
  const currentDone = new Map((current.subtasks ?? []).map((s) => [s.id, s.done]));
  return {
    task: before,
    sortKey: snap.sortKey,
    subtaskDone: snap.subtasks.filter((s) => currentDone.get(s.id) !== s.done).map((s) => ({ id: s.id, done: s.done })),
    completionId: record.id,
  };
}

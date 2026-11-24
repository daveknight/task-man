import { addDays, weekdayOf } from './dates.ts';
import { assertRepeat, nextDueDate, startForDue } from './repeat.ts';
import type { ISODate, MonthlyNth, MonthlyRule, RepeatFreq, RepeatRule, Task, Weekday } from './types.ts';

const WEEK_ORDER: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const FROM_SUNDAY: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SHORT: Record<Weekday, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const FULL: Record<Weekday, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const UNIT: Record<RepeatFreq, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
};

export type RepeatPresetId = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays';

export interface RepeatPreset {
  id: RepeatPresetId;
  /** The menu row, with the weekday written out: "Weekly on Wednesday". */
  label: string;
  rule: RepeatRule;
}

function parts(date: ISODate): { y: number; m: number; d: number; weekday: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

function monthDay(date: ISODate): string {
  const { m, d } = parts(date);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Wed, Nov 25", with the year when it isn't `today`'s year. */
function withWeekday(date: ISODate, today: ISODate): string {
  const p = parts(date);
  const year = p.y === parts(today).y ? '' : `, ${p.y}`;
  return `${SHORT[FROM_SUNDAY[p.weekday]!]}, ${monthDay(date)}${year}`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function sortDays(days: readonly Weekday[]): Weekday[] {
  return [...days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
}

function sameDays(a: readonly Weekday[], b: readonly Weekday[]): boolean {
  const left = sortDays(a);
  const right = sortDays(b);
  return left.length === right.length && left.every((day, i) => day === right[i]);
}

function dayOf(date: ISODate): number {
  return parts(date).d;
}

/** The 1st–4th time this weekday falls in its month, or the last when it is the 5th. */
export function nthOfDate(date: ISODate): number {
  const nth = Math.ceil(dayOf(date) / 7);
  return nth >= 5 ? -1 : nth;
}

function weekdaysOf(rule: RepeatRule, anchor?: ISODate | null): Weekday[] {
  if (rule.byWeekday?.length) return sortDays(rule.byWeekday);
  if (anchor) return [weekdayOf(anchor)];
  return [];
}

function monthlyOf(rule: RepeatRule, anchor?: ISODate | null): MonthlyRule | undefined {
  if (rule.monthly) return rule.monthly;
  if (anchor) return { day: dayOf(anchor) };
  return undefined;
}

function every(interval: number, freq: RepeatFreq): string {
  const [one, many] = UNIT[freq];
  return interval === 1 ? `Every ${one}` : `Every ${interval} ${many}`;
}

function monthlyWhat(monthly: MonthlyRule): string {
  if ('day' in monthly) return monthly.day === -1 ? 'the last day' : `the ${ordinal(monthly.day)}`;
  const nth = monthly.nth === -1 ? 'last' : ordinal(monthly.nth);
  return `the ${nth} ${FULL[monthly.weekday]}`;
}

function listDays(days: readonly Weekday[]): string {
  return days.map((day) => SHORT[day]).join(', ');
}

/**
 * The phrase for a repeat rule: "Weekly on Wed", "Every 2 weeks on Sun", "Monthly on the last day".
 * `anchor` is the due date, used when a weekly or monthly rule doesn't name its day, and for yearly.
 * Ends and the start offset are left off; the field shows the cadence only.
 */
export function repeatLabel(rule: RepeatRule, anchor?: ISODate | null): string {
  if (rule.mode === 'dates') return datesLabel(rule.dates ?? []);
  const interval = rule.interval ?? 1;
  const freq = rule.freq ?? 'daily';
  if (rule.mode === 'after_completion') {
    if (freq === 'daily' && interval === 1) return 'Daily after completion';
    return `${every(interval, freq)} after completion`;
  }
  if (freq === 'daily') return interval === 1 ? 'Daily' : `Every ${interval} days`;
  if (freq === 'weekly') return weeklyLabel(interval, weekdaysOf(rule, anchor));
  if (freq === 'monthly') {
    const monthly = monthlyOf(rule, anchor);
    if (!monthly) return interval === 1 ? 'Monthly' : `Every ${interval} months`;
    const what = monthlyWhat(monthly);
    return interval === 1 ? `Monthly on ${what}` : `Every ${interval} months on ${what}`;
  }
  const on = anchor ? ` on ${monthDay(anchor)}` : '';
  return interval === 1 ? `Yearly${on}` : `Every ${interval} years${on}`;
}

function weeklyLabel(interval: number, days: readonly Weekday[]): string {
  const weekdays = sameDays(days, WEEKDAYS);
  if (interval === 1 && weekdays) return 'Every weekday';
  if (interval === 1 && days.length === 1) return `Weekly on ${SHORT[days[0]!]}`;
  if (interval === 1 && days.length > 1) return `Weekly on ${listDays(days)}`;
  if (weekdays) return `Every ${interval} weeks on weekdays`;
  if (days.length) return `Every ${interval} weeks on ${listDays(days)}`;
  return interval === 1 ? 'Weekly' : `Every ${interval} weeks`;
}

function datesLabel(dates: readonly ISODate[]): string {
  const sorted = [...dates].sort();
  if (sorted.length === 0) return 'On specific dates';
  const shown = sorted.slice(0, 2).map(monthDay);
  if (sorted.length === 1) return `On ${shown[0]}`;
  if (sorted.length === 2) return `On ${shown[0]} and ${shown[1]}`;
  if (sorted.length === 3) return `On ${shown[0]}, ${shown[1]} and ${monthDay(sorted[2]!)}`;
  return `On ${shown[0]}, ${shown[1]} and ${sorted.length - 2} more`;
}

/** Daily, weekly on the anchor's weekday, monthly on its date, yearly, and every weekday. */
export function repeatPresets(anchor: ISODate): RepeatPreset[] {
  const weekday = weekdayOf(anchor);
  const day = dayOf(anchor);
  return [
    { id: 'daily', label: 'Daily', rule: { mode: 'schedule', freq: 'daily', interval: 1 } },
    {
      id: 'weekly',
      label: `Weekly on ${FULL[weekday]}`,
      rule: { mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: [weekday] },
    },
    {
      id: 'monthly',
      label: `Monthly on the ${ordinal(day)}`,
      rule: { mode: 'schedule', freq: 'monthly', interval: 1, monthly: { day } },
    },
    { id: 'yearly', label: `Yearly on ${monthDay(anchor)}`, rule: { mode: 'schedule', freq: 'yearly', interval: 1 } },
    {
      id: 'weekdays',
      label: 'Every weekday',
      rule: { mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: [...WEEKDAYS] },
    },
  ];
}

/**
 * Which preset this rule is, ignoring Ends and the start offset. A weekly rule with no
 * weekdays means the anchor's weekday, the way the next-date math reads it.
 */
export function matchingPreset(rule: RepeatRule, anchor: ISODate): RepeatPresetId | null {
  return repeatPresets(anchor).find((preset) => sameCadence(rule, preset.rule, anchor))?.id ?? null;
}

function sameCadence(rule: RepeatRule, preset: RepeatRule, anchor: ISODate): boolean {
  if (rule.mode !== preset.mode || rule.freq !== preset.freq || (rule.interval ?? 1) !== (preset.interval ?? 1)) return false;
  if (rule.mode === 'dates') return false;
  if (preset.freq === 'weekly') return sameDays(weekdaysOf(rule, anchor), preset.byWeekday ?? []);
  if (preset.freq === 'monthly') return sameMonthly(monthlyOf(rule, anchor), preset.monthly);
  return true;
}

function sameMonthly(a: MonthlyRule | undefined, b: MonthlyRule | undefined): boolean {
  if (!a || !b) return a === b;
  if ('day' in a || 'day' in b) return 'day' in a && 'day' in b && a.day === b.day;
  return a.nth === (b as MonthlyNth).nth && a.weekday === (b as MonthlyNth).weekday;
}

function upcoming(rule: RepeatRule, due: ISODate, today: ISODate, count: number): ISODate[] {
  const dates: ISODate[] = [];
  let cursor = due;
  for (let i = 0; i < count; i++) {
    const next = nextDueDate(rule, cursor, today);
    if (!next) break;
    dates.push(next);
    cursor = next;
  }
  return dates;
}

function readySentence(rule: RepeatRule, next: ISODate | undefined, today: ISODate, datesMode: boolean): string {
  if (rule.startOffsetDays == null || !next) return '';
  if (rule.startOffsetDays === 0) return ' It moves to Ready on the due date.';
  if (datesMode) {
    const n = rule.startOffsetDays;
    return ` It moves to Ready ${n} ${n === 1 ? 'day' : 'days'} early.`;
  }
  const start = startForDue(next, rule);
  return start ? ` It moves to Ready on ${withWeekday(start, today)}.` : '';
}

/**
 * The custom editor's note. Schedule lists the next dues; after completion counts from today
 * and never mentions weekdays; specific dates end when the list runs out.
 */
export function repeatDetail(rule: RepeatRule, due: ISODate, today: ISODate): string {
  assertRepeat(rule);
  if (rule.mode === 'after_completion') {
    const next = nextDueDate(rule, due, today);
    const when = next ? withWeekday(next, today) : 'later';
    return `Counts from the day you complete it. Completing today makes the next one due ${when}.${readySentence(rule, next ?? undefined, today, false)}`;
  }
  if (rule.mode === 'dates') {
    const next = upcoming(rule, due, today, 1)[0];
    const base = next
      ? 'Repeats on each date in turn, then ends: completing the last one finishes the task.'
      : 'Those dates are already past, so completing it finishes the task.';
    return `${base}${readySentence(rule, next ?? due, today, true)}`;
  }
  const nth = rule.freq === 'monthly' && rule.monthly && 'nth' in rule.monthly ? ` (the ${rule.monthly.nth === -1 ? 'last' : ordinal(rule.monthly.nth)} ${FULL[rule.monthly.weekday]})` : '';
  const count = nth ? 2 : 3;
  const dates = upcoming(rule, due, today, count);
  if (dates.length === 0) return 'Completing it finishes the task.';
  const [first, ...rest] = dates;
  const then = rest.length === 0 ? '' : rest.length === 1 ? `, then ${monthDay(rest[0]!)}` : `, then ${monthDay(rest[0]!)} and ${monthDay(rest[1]!)}`;
  return `Next due ${withWeekday(first!, today)}${nth}${then}.${readySentence(rule, first, today, false)}`;
}

/** The one line under the presets. Null when the task doesn't repeat. */
export function repeatHint(rule: RepeatRule | null | undefined, due: ISODate, today: ISODate): string | null {
  if (!rule) return null;
  if (rule.mode === 'after_completion') return repeatDetail(rule, due, today);
  if (rule.mode === 'dates') {
    const next = upcoming(rule, due, today, 1)[0];
    return next ? `Repeats on each listed date. Next: ${withWeekday(next, today)}.` : 'Those dates are already past, so completing it finishes the task.';
  }
  const next = upcoming(rule, due, today, 1)[0];
  return next ? `Repeats from the due date. Next: ${withWeekday(next, today)}.` : null;
}

/**
 * Puts a repeat on a task, or clears it. A rule needs a due date: none becomes today, or the
 * first listed date. On an Open task the start date follows the offset, and no offset clears it.
 * Waiting and In Progress have no start date, so theirs is left alone.
 */
export function withRepeat<T extends Task>(task: T, rule: RepeatRule | null, today: ISODate): T {
  if (!rule) return { ...task, repeat: null };
  assertRepeat(rule);
  const listed = rule.mode === 'dates' && rule.dates?.length ? [...rule.dates].sort()[0]! : today;
  const dueDate = task.dueDate ?? listed;
  const startDate = task.status === 'open' ? startForDue(dueDate, rule) : (task.startDate ?? null);
  return { ...task, repeat: rule, dueDate, startDate };
}

/** A week past the anchor, so a new specific-dates list still has a next occurrence. */
export function seedRepeatDate(anchor: ISODate): ISODate {
  return addDays(anchor, 7);
}

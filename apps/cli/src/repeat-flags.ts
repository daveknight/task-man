import { addDays, resolveDate, validateRepeat, type ISODate, type RepeatFreq, type RepeatMode, type RepeatRule, type Weekday } from '@app/core';

const FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NTH: Record<string, number> = { '1': 1, '1st': 1, first: 1, '2': 2, '2nd': 2, second: 2, '3': 3, '3rd': 3, third: 3, '4': 4, '4th': 4, fourth: 4, last: -1 };

export interface RepeatFlags {
  /** daily, weekly, monthly, yearly, weekdays, or none to clear it. */
  repeat?: string;
  mode?: string;
  interval?: string;
  byWeekday?: string;
  /** 31, last, "2nd tue", "last fri". */
  monthly?: string;
  /** Comma-separated dates for dates mode. */
  dates?: string;
  /** A whole number of days, or none. */
  startOffset?: string;
  /** never, a date, or count:3. */
  ends?: string;
}

export function hasRepeatFlags(flags: RepeatFlags): boolean {
  return Object.values(flags).some((value) => value !== undefined);
}

function integer(value: string, flag: string, min: number): number {
  if (!/^\d+$/.test(value)) throw new Error(`${flag} must be a whole number of at least ${min}`);
  const n = Number(value);
  if (n < min) throw new Error(`${flag} must be a whole number of at least ${min}`);
  return n;
}

function parseMode(value: string | undefined): RepeatMode | undefined {
  if (value === undefined) return undefined;
  if (value === 'schedule' || value === 'after_completion' || value === 'dates') return value;
  throw new Error(`--repeat-mode must be schedule, after_completion or dates (got ${JSON.stringify(value)})`);
}

function parseWeekdays(value: string): Weekday[] {
  const days = value.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  for (const day of days) {
    if (!WEEKDAYS.includes(day as Weekday)) throw new Error(`Unknown weekday ${JSON.stringify(day)} (mon, tue, wed, thu, fri, sat, sun)`);
  }
  return days as Weekday[];
}

function parseMonthly(value: string): RepeatRule['monthly'] {
  const text = value.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (text === 'last') return { day: -1 };
  if (/^\d+$/.test(text)) return { day: Number(text) };
  const match = /^(\d+(?:st|nd|rd|th)?|first|second|third|fourth|last)\s+(mon|tue|wed|thu|fri|sat|sun)$/.exec(text);
  if (!match || NTH[match[1]!] === undefined) throw new Error('--monthly is a day (31 or last) or an nth weekday (2nd tue, last fri)');
  return { nth: NTH[match[1]!]!, weekday: match[2] as Weekday };
}

function parseEnds(value: string, today: ISODate): RepeatRule['ends'] {
  if (value === 'never') return { never: true };
  const count = /^(?:count|after):(\d+)$/.exec(value);
  if (count) return { afterCount: integer(count[1]!, '--ends count', 1) };
  return { onDate: resolveDate(value, today) };
}

/**
 * Builds the repeat rule for `add` and `edit`. `--repeat none` clears it. A repeat with no due
 * date is anchored by the caller (`dueForRepeat`). Fields a mode doesn't use are left off, and
 * `validateRepeat` rejects the rest.
 */
export function repeatFromFlags(flags: RepeatFlags, today: ISODate, existing: RepeatRule | null): RepeatRule | null {
  if (!hasRepeatFlags(flags)) return existing;
  if (flags.repeat === 'none') {
    const rest = { ...flags, repeat: undefined };
    if (hasRepeatFlags(rest)) throw new Error('--repeat none clears the repeat, so it takes no other repeat option');
    return null;
  }

  const named = flags.repeat;
  const freqFromName = named && (FREQS as readonly string[]).includes(named) ? (named as RepeatFreq) : undefined;
  if (named && named !== 'weekdays' && !freqFromName) throw new Error('--repeat must be daily, weekly, monthly, yearly, weekdays or none');
  if (named === 'weekdays' && flags.mode !== undefined && flags.mode !== 'schedule') throw new Error('weekdays is a schedule repeat');

  const mode = parseMode(flags.mode) ?? (named ? 'schedule' : undefined) ?? (flags.dates && !existing ? 'dates' : undefined) ?? existing?.mode;
  if (!mode) throw new Error('Set a repeat with --repeat daily|weekly|monthly|yearly|weekdays, or --repeat-mode dates --dates ...');

  const same = existing?.mode === mode ? existing : null;
  const rule: RepeatRule = { mode };

  if (mode === 'dates') {
    if (freqFromName) throw new Error('A dates repeat has no frequency. Pass the days with --dates.');
    const dates = flags.dates
      ? flags.dates.split(',').map((d) => d.trim()).filter(Boolean).map((d) => resolveDate(d, today))
      : same?.dates;
    if (!dates?.length) throw new Error('--repeat-mode dates needs --dates date,date');
    rule.dates = dates;
  } else {
    const freq = freqFromName ?? (named === 'weekdays' ? 'weekly' : same?.freq);
    if (!freq) throw new Error('--repeat needs daily, weekly, monthly, yearly or weekdays');
    rule.freq = freq;
    rule.interval = flags.interval !== undefined ? integer(flags.interval, '--interval', 1) : (same?.interval ?? 1);
    if (flags.byWeekday && !(mode === 'schedule' && freq === 'weekly')) throw new Error('--by-weekday only applies to a weekly schedule');
    if (flags.monthly && !(mode === 'schedule' && freq === 'monthly')) throw new Error('--monthly only applies to a monthly schedule');
    if (mode === 'schedule' && freq === 'weekly') {
      const days = named === 'weekdays' ? (['mon', 'tue', 'wed', 'thu', 'fri'] as Weekday[]) : flags.byWeekday ? parseWeekdays(flags.byWeekday) : same?.freq === 'weekly' ? same.byWeekday : undefined;
      if (days?.length) rule.byWeekday = days;
    }
    if (mode === 'schedule' && freq === 'monthly') {
      const monthly = flags.monthly ? parseMonthly(flags.monthly) : same?.freq === 'monthly' ? same.monthly : undefined;
      if (monthly) rule.monthly = monthly;
    }
  }

  if (flags.ends !== undefined) rule.ends = parseEnds(flags.ends, today);
  else if (same?.ends) rule.ends = same.ends;
  if (flags.startOffset === 'none') {
    // An explicit none stores no offset, which means the next occurrence has no start date.
  } else if (flags.startOffset !== undefined) rule.startOffsetDays = integer(flags.startOffset, '--start-offset', 0);
  else if (same?.startOffsetDays != null) rule.startOffsetDays = same.startOffsetDays;

  const issues = validateRepeat(rule);
  if (issues.length > 0) throw new Error(issues.map((i) => i.message).join('; '));
  return rule;
}

/** A repeat with no due date is anchored to today, or to the first listed date. */
export function dueForRepeat(rule: RepeatRule, due: ISODate | null, today: ISODate): ISODate {
  if (due) return due;
  if (rule.mode === 'dates' && rule.dates?.length) return [...rule.dates].sort()[0]!;
  return today;
}

/** The start date an offset asks for. No offset means no start date; 0 means the due date. */
export function startForOffset(due: ISODate, rule: RepeatRule): ISODate | null {
  if (rule.startOffsetDays == null) return null;
  return addDays(due, -rule.startOffsetDays);
}

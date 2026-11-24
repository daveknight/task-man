import type { ISODate, Weekday } from './types.ts';

export type { Weekday };

/** Index 0 is Sunday, matching Date#getUTCDay. */
const WEEKDAYS_FROM_SUNDAY: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RELATIVE = /^([+-])(\d+)([dwmy])$/;

interface YMD {
  y: number;
  m: number;
  d: number;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function toYMD(date: ISODate): YMD {
  const match = ISO_DATE.exec(date);
  if (!match || !isValidDate(date)) throw new Error(`Not a valid date: ${JSON.stringify(date)}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function fromYMD({ y, m, d }: YMD): ISODate {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidDate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function addDays(date: ISODate, days: number): ISODate {
  const { y, m, d } = toYMD(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return fromYMD({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** Adds calendar months, clamping to the end of a shorter month (Jan 31 + 1m = Feb 28/29). */
export function addMonths(date: ISODate, months: number): ISODate {
  const { y, m, d } = toYMD(date);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = index - ny * 12 + 1;
  return fromYMD({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function weekdayOf(date: ISODate): Weekday {
  const { y, m, d } = toYMD(date);
  return WEEKDAYS_FROM_SUNDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
}

/** The first date on or after `date` whose weekday is in `weekdays`. */
export function nextWeekdayOnOrAfter(date: ISODate, weekdays: readonly Weekday[]): ISODate {
  if (weekdays.length === 0) return date;
  for (let i = 0; i < 7; i++) {
    const candidate = addDays(date, i);
    if (weekdays.includes(weekdayOf(candidate))) return candidate;
  }
  throw new Error(`No valid weekday in ${JSON.stringify(weekdays)}`);
}

/** The local calendar day of `instant` in `timeZone` (default: this device's zone). */
export function localDate(instant: Date = new Date(), timeZone?: string): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Resolves a date relative to `today`: `today`, `+3d`, `-2d`, `+2w`, `+1m`, `-1y`,
 * or an absolute `YYYY-MM-DD`. Months and years clamp at month ends.
 */
export function resolveDate(input: string, today: ISODate): ISODate {
  const value = input.trim().toLowerCase();
  if (value === 'today') return today;
  if (ISO_DATE.test(value)) {
    if (!isValidDate(value)) throw new Error(`Not a valid date: ${JSON.stringify(input)}`);
    return value;
  }
  const match = RELATIVE.exec(value);
  if (!match) throw new Error(`Not a date or relative date: ${JSON.stringify(input)}`);
  const n = Number(match[2]) * (match[1] === '-' ? -1 : 1);
  switch (match[3]) {
    case 'd':
      return addDays(today, n);
    case 'w':
      return addDays(today, n * 7);
    case 'm':
      return addMonths(today, n);
    default:
      return addMonths(today, n * 12);
  }
}

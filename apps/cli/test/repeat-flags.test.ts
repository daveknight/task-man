import { describe, expect, it } from 'vitest';
import { dueForRepeat, repeatFromFlags, startForOffset } from '../src/repeat-flags.ts';

const TODAY = '2026-11-18';

describe('repeat flags', () => {
  it('maps the named presets onto schedule rules', () => {
    expect(repeatFromFlags({ repeat: 'daily' }, TODAY, null)).toEqual({ mode: 'schedule', freq: 'daily', interval: 1 });
    expect(repeatFromFlags({ repeat: 'weekly', interval: '2', byWeekday: 'sun,mon' }, TODAY, null)).toEqual({
      mode: 'schedule',
      freq: 'weekly',
      interval: 2,
      byWeekday: ['sun', 'mon'],
    });
    expect(repeatFromFlags({ repeat: 'weekdays' }, TODAY, null)).toEqual({
      mode: 'schedule',
      freq: 'weekly',
      interval: 1,
      byWeekday: ['mon', 'tue', 'wed', 'thu', 'fri'],
    });
    expect(repeatFromFlags({ repeat: 'monthly', monthly: '2nd tue' }, TODAY, null)).toEqual({
      mode: 'schedule',
      freq: 'monthly',
      interval: 1,
      monthly: { nth: 2, weekday: 'tue' },
    });
    expect(repeatFromFlags({ repeat: 'monthly', monthly: 'last' }, TODAY, null)?.monthly).toEqual({ day: -1 });
    expect(repeatFromFlags({ repeat: 'yearly', ends: 'never' }, TODAY, null)).toEqual({
      mode: 'schedule',
      freq: 'yearly',
      interval: 1,
      ends: { never: true },
    });
  });

  it('builds after-completion, dates, ends and the start offset', () => {
    expect(repeatFromFlags({ repeat: 'weekly', mode: 'after_completion', interval: '5', startOffset: '7' }, TODAY, null)).toEqual({
      mode: 'after_completion',
      freq: 'weekly',
      interval: 5,
      startOffsetDays: 7,
    });
    expect(repeatFromFlags({ mode: 'dates', dates: '2026-12-01,+150d', ends: 'count:3', startOffset: '0' }, TODAY, null)).toEqual({
      mode: 'dates',
      dates: ['2026-12-01', '2027-04-17'],
      ends: { afterCount: 3 },
      startOffsetDays: 0,
    });
    expect(repeatFromFlags({ repeat: 'daily', ends: '2026-12-01' }, TODAY, null)?.ends).toEqual({ onDate: '2026-12-01' });
  });

  it('rejects a field the mode does not use, and clears only with --repeat none', () => {
    expect(() => repeatFromFlags({ repeat: 'daily', mode: 'after_completion', byWeekday: 'mon' }, TODAY, null)).toThrow(/by-weekday/);
    expect(() => repeatFromFlags({ repeat: 'weekdays', mode: 'after_completion' }, TODAY, null)).toThrow(/schedule/);
    expect(() => repeatFromFlags({ repeat: 'daily', monthly: 'last' }, TODAY, null)).toThrow(/monthly/);
    const existing = repeatFromFlags({ repeat: 'daily', startOffset: '2' }, TODAY, null);
    expect(repeatFromFlags({ repeat: 'none' }, TODAY, existing)).toBeNull();
    expect(() => repeatFromFlags({ repeat: 'none', interval: '2' }, TODAY, existing)).toThrow(/no other repeat option/);
  });

  it('anchors a missing due date and turns an offset into a start date', () => {
    const dates = repeatFromFlags({ mode: 'dates', dates: '+10d,+3d' }, TODAY, null)!;
    expect(dueForRepeat(dates, null, TODAY)).toBe('2026-11-21');
    const daily = repeatFromFlags({ repeat: 'daily' }, TODAY, null)!;
    expect(dueForRepeat(daily, null, TODAY)).toBe(TODAY);
    expect(startForOffset('2026-11-18', daily)).toBeNull();
    expect(startForOffset('2026-11-18', { ...daily, startOffsetDays: 0 })).toBe('2026-11-18');
    expect(startForOffset('2026-11-18', { ...daily, startOffsetDays: 2 })).toBe('2026-11-16');
  });
});

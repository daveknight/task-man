import { describe, expect, it } from 'vitest';
import {
  matchingPreset,
  repeatDetail,
  repeatHint,
  repeatLabel,
  repeatPresets,
  withRepeat,
  type RepeatRule,
  type Task,
} from '../src/index.ts';

const anchor = '2026-11-18';
const task = (fields: Partial<Task> = {}): Task => ({
  id: 't',
  title: 'Task',
  status: 'open',
  startDate: null,
  hideUntil: null,
  dueDate: null,
  ...fields,
});

describe('repeatLabel', () => {
  it('names the presets the field shows, shorter than the menu', () => {
    expect(repeatLabel({ mode: 'schedule', freq: 'daily', interval: 1 })).toBe('Daily');
    expect(repeatLabel({ mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['wed'] })).toBe('Weekly on Wed');
    expect(repeatLabel({ mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['mon', 'tue', 'wed', 'thu', 'fri'] })).toBe('Every weekday');
    expect(repeatLabel({ mode: 'schedule', freq: 'monthly', interval: 1, monthly: { day: 18 } })).toBe('Monthly on the 18th');
    expect(repeatLabel({ mode: 'schedule', freq: 'yearly', interval: 1 }, anchor)).toBe('Yearly on Nov 18');
  });

  it('uses Every N for intervals, including the 2nd Tuesday and the last day', () => {
    expect(repeatLabel({ mode: 'schedule', freq: 'weekly', interval: 2, byWeekday: ['sun'] })).toBe('Every 2 weeks on Sun');
    expect(repeatLabel({ mode: 'schedule', freq: 'daily', interval: 2 })).toBe('Every 2 days');
    expect(repeatLabel({ mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['fri', 'mon', 'wed'] })).toBe('Weekly on Mon, Wed, Fri');
    expect(repeatLabel({ mode: 'schedule', freq: 'monthly', interval: 1, monthly: { nth: 2, weekday: 'tue' } })).toBe('Monthly on the 2nd Tuesday');
    expect(repeatLabel({ mode: 'schedule', freq: 'monthly', interval: 1, monthly: { nth: -1, weekday: 'fri' } })).toBe('Monthly on the last Friday');
    expect(repeatLabel({ mode: 'schedule', freq: 'monthly', interval: 1, monthly: { day: -1 } })).toBe('Monthly on the last day');
    expect(repeatLabel({ mode: 'schedule', freq: 'monthly', interval: 3, monthly: { day: 18 } })).toBe('Every 3 months on the 18th');
    expect(repeatLabel({ mode: 'schedule', freq: 'yearly', interval: 2 }, anchor)).toBe('Every 2 years on Nov 18');
  });

  it('reads a missing weekday or day from the due date', () => {
    expect(repeatLabel({ mode: 'schedule', freq: 'weekly', interval: 1 }, '2026-11-19')).toBe('Weekly on Thu');
    expect(repeatLabel({ mode: 'schedule', freq: 'monthly', interval: 1 }, '2026-11-19')).toBe('Monthly on the 19th');
  });

  it('keeps after-completion off any weekday, and lists specific dates', () => {
    expect(repeatLabel({ mode: 'after_completion', freq: 'daily', interval: 1 })).toBe('Daily after completion');
    expect(repeatLabel({ mode: 'after_completion', freq: 'weekly', interval: 2 })).toBe('Every 2 weeks after completion');
    expect(repeatLabel({ mode: 'after_completion', freq: 'monthly', interval: 1 })).toBe('Every month after completion');
    expect(repeatLabel({ mode: 'dates', dates: ['2026-11-25', '2026-12-12', '2027-01-08'] })).toBe('On Nov 25, Dec 12 and Jan 8');
    expect(repeatLabel({ mode: 'dates', dates: ['2026-11-25', '2026-12-12', '2027-01-08', '2027-04-15'] })).toBe('On Nov 25, Dec 12 and 2 more');
  });
});

describe('repeat presets', () => {
  const presets = repeatPresets(anchor);

  it('offers the five rows for the anchor day', () => {
    expect(presets.map((p) => p.label)).toEqual(['Daily', 'Weekly on Wednesday', 'Monthly on the 18th', 'Yearly on Nov 18', 'Every weekday']);
  });

  it('matches a preset whether or not the weekday is written down, and ignores the offset', () => {
    const weekly: RepeatRule = { mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['wed'], startOffsetDays: 1, ends: { afterCount: 10 } };
    expect(matchingPreset(weekly, anchor)).toBe('weekly');
    expect(matchingPreset({ mode: 'schedule', freq: 'weekly', interval: 1 }, anchor)).toBe('weekly');
    expect(matchingPreset({ mode: 'schedule', freq: 'weekly', interval: 2, byWeekday: ['wed'] }, anchor)).toBeNull();
    expect(matchingPreset({ mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['mon', 'tue', 'wed', 'thu', 'fri'] }, anchor)).toBe('weekdays');
    expect(matchingPreset({ mode: 'schedule', freq: 'monthly', interval: 1, monthly: { nth: 3, weekday: 'wed' } }, anchor)).toBeNull();
  });
});

describe('repeat notes', () => {
  it('lists the next weekly dues and the day it becomes Ready', () => {
    const rule: RepeatRule = { mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['wed'], startOffsetDays: 1 };
    expect(repeatDetail(rule, anchor, anchor)).toBe('Next due Wed, Nov 25, then Dec 2 and Dec 9. It moves to Ready on Tue, Nov 24.');
    expect(repeatHint(rule, anchor, anchor)).toBe('Repeats from the due date. Next: Wed, Nov 25.');
  });

  it('names the 3rd Wednesday, and stops after two dates', () => {
    const rule: RepeatRule = { mode: 'schedule', freq: 'monthly', interval: 1, monthly: { nth: 3, weekday: 'wed' } };
    expect(repeatDetail(rule, anchor, anchor)).toBe('Next due Wed, Dec 16 (the 3rd Wednesday), then Jan 20.');
  });

  it('counts after completion from today and does not mention weekdays', () => {
    const rule: RepeatRule = { mode: 'after_completion', freq: 'weekly', interval: 2 };
    const note = repeatDetail(rule, anchor, anchor);
    expect(note).toBe('Counts from the day you complete it. Completing today makes the next one due Wed, Dec 2.');
    expect(note).not.toMatch(/[Ww]eekdays don't apply/);
    expect(repeatHint(rule, anchor, anchor)).toBe(note);
  });

  it('says a specific-dates list ends, and how early it moves to Ready', () => {
    const rule: RepeatRule = { mode: 'dates', dates: ['2026-11-25', '2026-12-12', '2027-01-08'], startOffsetDays: 1 };
    expect(repeatDetail(rule, anchor, anchor)).toBe(
      'Repeats on each date in turn, then ends: completing the last one finishes the task. It moves to Ready 1 day early.',
    );
  });
});

describe('withRepeat', () => {
  it('anchors a missing due date to today, or to the first listed date', () => {
    const daily = withRepeat(task(), { mode: 'schedule', freq: 'daily', interval: 1 }, anchor);
    expect(daily.dueDate).toBe(anchor);
    expect(daily.startDate).toBeNull();
    const dates = withRepeat(task(), { mode: 'dates', dates: ['2026-12-12', '2026-11-25'] }, anchor);
    expect(dates.dueDate).toBe('2026-11-25');
  });

  it('sets an Open task’s start from the offset, and leaves Waiting alone', () => {
    const early = withRepeat(task({ dueDate: '2026-11-19', startDate: '2026-11-20' }), { mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['thu'], startOffsetDays: 1 }, anchor);
    expect(early.startDate).toBe('2026-11-18');
    const waiting = withRepeat(task({ status: 'waiting', dueDate: anchor, hideUntil: anchor }), { mode: 'schedule', freq: 'daily', interval: 1, startOffsetDays: 2 }, anchor);
    expect(waiting.startDate).toBeNull();
    expect(waiting.hideUntil).toBe(anchor);
  });

  it('clears the repeat and keeps the dates', () => {
    const cleared = withRepeat(task({ dueDate: anchor, startDate: '2026-11-17', repeat: { mode: 'schedule', freq: 'daily', interval: 1 } }), null, anchor);
    expect(cleared.repeat).toBeNull();
    expect(cleared.dueDate).toBe(anchor);
    expect(cleared.startDate).toBe('2026-11-17');
  });
});

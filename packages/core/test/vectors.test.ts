import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildBoard,
  isValidSortKey,
  keyBetween,
  nextWeekdayOnOrAfter,
  resolveDate,
  resume,
  sectionFor,
  setDueDate,
  validateTask,
  waitingStateFor,
  weekdayOf,
  type Task,
  type Weekday,
} from '../src/index.ts';

function load<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../vectors/${name}`, import.meta.url), 'utf8')) as T;
}

/** Applies the vector defaults: omitted fields are null and status is open. */
function taskFrom(fields: Partial<Task>, id = 'task'): Task {
  return {
    id,
    title: 'Task',
    status: 'open',
    waitUntil: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    completedOn: null,
    deletedAt: null,
    deletedOn: null,
    flagged: false,
    ...fields,
  };
}

describe('sections.json', () => {
  const { cases } = load<{
    cases: { name: string; today: string; task: Partial<Task>; expect: { section: string; waitingState?: string } }[];
  }>('sections.json');

  it.each(cases)('$name', ({ today, task, expect: expected }) => {
    const t = taskFrom(task);
    const section = sectionFor(t, today);
    expect(section).toBe(expected.section);
    if (section === 'waiting') expect(waitingStateFor(t, today)).toBe(expected.waitingState);
    else expect(expected.waitingState).toBeUndefined();
  });
});

describe('board-order.json', () => {
  const { cases } = load<{
    cases: {
      name: string;
      today: string;
      options: { showCompleted?: boolean; showTrash?: boolean };
      tasks: (Partial<Task> & { id: string })[];
      positions: Record<string, string>;
      expect: Record<string, string[]>;
    }[];
  }>('board-order.json');

  it.each(cases)('$name', ({ today, options, tasks, positions, expect: expected }) => {
    const board = buildBoard(
      tasks.map((t) => taskFrom(t, t.id)),
      new Map(Object.entries(positions)),
      today,
      options,
    );
    const actual: Record<string, string[]> = {};
    for (const section of board.sections) {
      actual[section.id] = section.tasks.map((t) => t.id);
      if (section.id === 'waiting') actual.waiting_later = (section.later ?? []).map((t) => t.id);
      expect(section.count).toBe(section.tasks.length + (section.later?.length ?? 0));
    }
    expect(actual).toEqual(expected);
  });
});

describe('dates.json', () => {
  const vectors = load<{
    resolveDate: { today: string; input: string; expect?: string; expectError?: boolean }[];
    weekdayOf: { date: string; expect: string }[];
    nextWeekdayOnOrAfter: { date: string; weekdays: Weekday[]; expect: string }[];
  }>('dates.json');

  it.each(vectors.resolveDate)('resolveDate($input) on $today', ({ today, input, expect: expected, expectError }) => {
    if (expectError) expect(() => resolveDate(input, today)).toThrow();
    else expect(resolveDate(input, today)).toBe(expected);
  });

  it.each(vectors.weekdayOf)('weekdayOf($date)', ({ date, expect: expected }) => {
    expect(weekdayOf(date)).toBe(expected);
  });

  it.each(vectors.nextWeekdayOnOrAfter)('nextWeekdayOnOrAfter($date, $weekdays)', ({ date, weekdays, expect: expected }) => {
    expect(nextWeekdayOnOrAfter(date, weekdays)).toBe(expected);
  });
});

describe('sort-keys.json', () => {
  const vectors = load<{
    keyBetween: { a: string | null; b: string | null; expect?: string; expectError?: boolean }[];
    isValidSortKey: { key: string; expect: boolean }[];
  }>('sort-keys.json');

  it.each(vectors.keyBetween)('keyBetween($a, $b)', ({ a, b, expect: expected, expectError }) => {
    if (expectError) expect(() => keyBetween(a, b)).toThrow();
    else expect(keyBetween(a, b)).toBe(expected);
  });

  it.each(vectors.isValidSortKey)('isValidSortKey($key)', ({ key, expect: expected }) => {
    expect(isValidSortKey(key)).toBe(expected);
  });
});

describe('transitions.json', () => {
  const vectors = load<{
    setDueDate: {
      name: string;
      task: Partial<Task>;
      dueDate: string | null;
      expect: Partial<Task>;
      startMoved: { from: string; to: string } | null;
    }[];
    resume: { name: string; task: Partial<Task>; expect: Partial<Task> }[];
  }>('transitions.json');

  it.each(vectors.setDueDate)('setDueDate: $name', ({ task, dueDate, expect: expected, startMoved }) => {
    const result = setDueDate(taskFrom(task), dueDate);
    expect(result.task).toMatchObject(expected);
    expect(result.startMoved ?? null).toEqual(startMoved);
  });

  it.each(vectors.resume)('resume: $name', ({ task, expect: expected }) => {
    expect(resume(taskFrom(task))).toMatchObject(expected);
  });
});

describe('validate.json', () => {
  const { cases } = load<{ cases: { name: string; task: Partial<Task>; expect: string[] }[] }>('validate.json');

  it.each(cases)('$name', ({ task, expect: expected }) => {
    expect(validateTask(task).map((i) => i.field).sort()).toEqual([...expected].sort());
  });
});

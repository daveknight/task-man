import { describe, expect, it } from 'vitest';
import {
  OCCURRENCE_ALREADY_COMPLETED,
  OCCURRENCE_ALREADY_SKIPPED,
  planOccurrence,
  taskHistory,
  type OccurrenceRecord,
  type RepeatRule,
  type Task,
} from '../src/index.ts';

const NOW = '2026-11-18T19:00:00.000Z';
const ON = '2026-11-18';

const daily = (ends?: RepeatRule['ends']): RepeatRule => ({
  mode: 'schedule',
  freq: 'daily',
  interval: 1,
  ...(ends ? { ends } : {}),
});

function task(fields: Partial<Task> = {}): Task {
  return {
    id: 'plants',
    title: 'Water the plants',
    status: 'open',
    startDate: null,
    hideUntil: null,
    dueDate: '2026-11-18',
    repeat: daily(),
    ...fields,
  };
}

function occur(current: Task, kind: 'done' | 'skip', prior: OccurrenceRecord[], id: string) {
  return planOccurrence({
    id,
    task: current,
    kind,
    on: ON,
    now: NOW,
    historyCount: prior.length,
    sortKey: prior.length === 0 ? 'a0' : null,
    prior,
  });
}

describe('taskHistory', () => {
  it('lists completions and skips oldest first, and only the latest unedited row can be undone', () => {
    const first = occur(task(), 'skip', [], 'skip-1');
    const second = occur(first.task, 'done', [first.record], 'done-1');
    const history = taskHistory(second.task, [second.record, first.record], null);

    expect(history.map((row) => [row.kind, row.action, row.label, row.occurrenceDue, row.undoable])).toEqual([
      ['skip', 'skipped', 'Skipped', '2026-11-18', false],
      ['done', 'completed', 'Done', '2026-11-19', true],
    ]);
    expect(history[0]).toMatchObject({
      completedOn: ON,
      effect: { outcome: 'advance', dueDate: '2026-11-19', status: 'open', completedOn: null },
    });
    expect(history[1]).toMatchObject({
      effect: { outcome: 'advance', dueDate: '2026-11-20', status: 'open', completedOn: null },
    });
    expect(taskHistory(second.task, [second.record, first.record, { ...first.record, id: 'other', taskId: 'else' }], null)).toHaveLength(2);
  });

  it('drops Undo once the task has been edited since that occurrence', () => {
    const planned = occur(task(), 'skip', [], 'skip-1');
    const edited = { ...planned.task, title: 'Water the bigger plants' };
    expect(taskHistory(edited, [planned.record], null)[0]?.undoable).toBe(false);
    expect(taskHistory(planned.task, [planned.record], 'a0')[0]?.undoable).toBe(false);
  });

  it('refuses a second skip or completion of the same occurrence, and a skip counts toward the end', () => {
    const first = occur(task(), 'skip', [], 'skip-1');
    expect(first.outcome).toBe('advance');
    expect(first.task.completedAt ?? null).toBeNull();
    expect(() => occur(task(), 'skip', [first.record], 'skip-again')).toThrow(OCCURRENCE_ALREADY_SKIPPED);
    expect(() => occur(task(), 'done', [first.record], 'done-same')).toThrow(OCCURRENCE_ALREADY_SKIPPED);
    const done = occur(task({ id: 'garbage', title: 'Take out garbage' }), 'done', [], 'done-1');
    expect(() => occur(task({ id: 'garbage', title: 'Take out garbage' }), 'skip', [done.record], 'skip-same')).toThrow(OCCURRENCE_ALREADY_COMPLETED);

    const next = occur(first.task, 'skip', [first.record], 'skip-2');
    expect(next.record.occurrenceDue).toBe('2026-11-19');
    expect(next.task.completedAt ?? null).toBeNull();

    const ending = task({ repeat: daily({ afterCount: 2 }) });
    const counted = occur(ending, 'skip', [], 'end-1');
    expect(counted.outcome).toBe('advance');
    expect(counted.task.completedAt ?? null).toBeNull();
    const finished = occur(counted.task, 'skip', [counted.record], 'end-2');
    expect(finished.outcome).toBe('end');
    expect(finished.task.completedOn).toBe(ON);
    expect(taskHistory(finished.task, [counted.record, finished.record], null).map((row) => row.effect.outcome)).toEqual(['advance', 'end']);
  });
});

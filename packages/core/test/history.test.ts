import { describe, expect, it } from 'vitest';
import {
  historyCards,
  historyWhen,
  isOccurrenceHistory,
  OCCURRENCE_ALREADY_COMPLETED,
  OCCURRENCE_ALREADY_SKIPPED,
  planOccurrence,
  taskHistory,
  type ActivityRecord,
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
    const history = taskHistory(second.task, [second.record, first.record], null).filter(isOccurrenceHistory);

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
    expect(taskHistory(edited, [planned.record], null).filter(isOccurrenceHistory)[0]?.undoable).toBe(false);
    expect(taskHistory(planned.task, [planned.record], 'a0').filter(isOccurrenceHistory)[0]?.undoable).toBe(false);
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
    expect(taskHistory(finished.task, [counted.record, finished.record], null).filter(isOccurrenceHistory).map((row) => row.effect.outcome)).toEqual(['advance', 'end']);
  });
});

function activity(fields: Partial<ActivityRecord> & Pick<ActivityRecord, 'id' | 'field'>): ActivityRecord {
  return {
    userId: 'u',
    taskId: 'plants',
    batchId: fields.id,
    seq: 0,
    at: '2026-11-18T19:00:00.000Z',
    kind: 'changed',
    before: null,
    after: null,
    ...fields,
  };
}

function context(fields: { status?: Task['status']; startDate?: string | null; completedAt?: string | null; deletedAt?: string | null } = {}) {
  return {
    status: fields.status ?? 'open',
    startDate: fields.startDate ?? null,
    completedAt: fields.completedAt ?? null,
    completedOn: fields.completedAt ? ON : null,
    deletedAt: fields.deletedAt ?? null,
    deletedOn: fields.deletedAt ? ON : null,
  };
}

describe('field changes on the timeline', () => {
  it('unions field changes with occurrences oldest first, and one save is one card', () => {
    const first = occur(task(), 'skip', [], 'skip-1');
    const changes = [
      activity({ id: 'due', batchId: 'save', seq: 1, at: '2026-11-18T18:00:00.000Z', field: 'dueDate', before: '2026-11-18', after: '2026-11-20' }),
      activity({ id: 'title', batchId: 'save', seq: 0, at: '2026-11-18T18:00:00.000Z', field: 'title', before: 'Water the plants', after: 'Water the bigger plants' }),
      activity({ id: 'made', kind: 'created', at: '2026-11-01T18:00:00.000Z', field: 'title', after: 'Water the plants' }),
      activity({ id: 'other-task', taskId: 'else', field: 'title', before: 'A', after: 'B' }),
    ];
    const history = taskHistory(first.task, [first.record], null, changes);

    expect(history.map((row) => row.action)).toEqual(['created', 'changed', 'changed', 'skipped']);
    expect(history.filter(isOccurrenceHistory).map((row) => row.undoable)).toEqual([true]);
    expect(history.find((row) => row.id === 'title')).toMatchObject({ verb: 'changed the title', detail: 'Water the plants → Water the bigger plants' });
    expect(history.find((row) => row.id === 'due')).toMatchObject({ verb: 'changed the time', detail: 'Nov 18 → Nov 20' });

    const cards = historyCards(history);
    expect(cards.map((card) => card.verb)).toEqual(['created the task', 'changed the task', 'skipped an occurrence']);
    expect(cards[1]?.lines.map((line) => line.detail)).toEqual([
      'Title: Water the plants → Water the bigger plants',
      'Time: Nov 18 → Nov 20',
    ]);
    expect(cards[2]).toMatchObject({ undoable: true, occurrence: { kind: 'skip' } });
  });

  it('names a status change by the section that day, including Recently deleted', () => {
    const at = '2026-11-18T19:00:00.000Z';
    const ready = taskHistory(task({ repeat: null, dueDate: null }), [], null, [
      activity({ id: 'move', at, field: 'status', before: context(), after: context({ status: 'in_progress' }) }),
    ]);
    expect(ready[0]).toMatchObject({ verb: 'moved the task', detail: 'Ready → In Progress' });

    const upcoming = taskHistory(task({ repeat: null }), [], null, [
      activity({
        id: 'later',
        at,
        field: 'status',
        before: context({ startDate: '2026-11-20' }),
        after: context({ status: 'in_progress' }),
      }),
    ]);
    expect(upcoming[0]).toMatchObject({ detail: 'Upcoming → In Progress' });

    const removed = taskHistory(task({ repeat: null, dueDate: null }), [], null, [
      activity({ id: 'trash', at, field: 'deleted', before: context(), after: context({ deletedAt: at }) }),
    ]);
    expect(removed[0]).toMatchObject({ verb: 'deleted the task', detail: 'Ready → Recently deleted' });
    expect(JSON.stringify(removed)).not.toContain('Trash');

    const noted = taskHistory(task({ repeat: null, dueDate: null }), [], null, [
      activity({ id: 'note', at, field: 'description', before: '', after: 'Bring the hose' }),
    ]);
    expect(noted[0]).toMatchObject({ verb: 'edited the content', detail: 'Empty → Bring the hose' });

    const checked = taskHistory(task({ repeat: null, dueDate: null }), [], null, [
      activity({
        id: 'step',
        at,
        field: 'subtask',
        before: { id: 's', title: 'Pack the bag', done: false },
        after: { id: 's', title: 'Pack the bag', done: true },
      }),
    ]);
    expect(checked[0]).toMatchObject({ verb: 'checked a subtask', detail: 'Pack the bag' });
  });

  it('says just now for the last minute and otherwise a Pacific date and time', () => {
    expect(historyWhen('2026-11-18T19:00:00.000Z', new Date('2026-11-18T19:00:30.000Z'))).toBe('just now');
    expect(historyWhen('2026-11-18T19:00:00.000Z', new Date('2026-11-18T19:02:00.000Z'))).toBe('Nov 18, 11:00 AM');
    expect(historyWhen('2025-11-18T19:00:00.000Z', new Date('2026-11-18T19:02:00.000Z'))).toBe('Nov 18, 2025, 11:00 AM');
  });
});

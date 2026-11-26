import { planOccurrence, planUndoOccurrence, type OccurrenceRecord } from './repeat.ts';
import type { ISODate, Status, Task } from './types.ts';

/** What one recorded occurrence left behind. Replayed from its snapshot, so a later edit doesn't rewrite it. */
export interface TaskHistoryEffect {
  /** `advance` keeps the series going. `end` finishes it for good. */
  outcome: 'advance' | 'end';
  status: Status;
  dueDate: ISODate | null;
  startDate: ISODate | null;
  hideUntil: ISODate | null;
  /** Set only when this occurrence finished the series. */
  completedOn: ISODate | null;
}

/**
 * One row of a task's own history. Completions and skips, oldest first.
 * The completed log is the cross-task view and leaves skips out; this one keeps both,
 * because a skip changes the series without finishing the task.
 */
export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  /** Stored kind. `done` finished that occurrence; `skip` moved past it. */
  kind: 'done' | 'skip';
  /** Stable verb for clients, including a later MCP tool. */
  action: 'completed' | 'skipped';
  /** The word the history view shows. */
  label: 'Done' | 'Skipped';
  /** The occurrence's due date. A task can record each due date only once. */
  occurrenceDue: ISODate;
  /** The local day the completion or skip was recorded. */
  completedOn: ISODate;
  completedAt: string;
  effect: TaskHistoryEffect;
  /** The latest row, and only while the task still matches what that occurrence left. */
  undoable: boolean;
}

function compareOldest(a: { completedAt: string; id: string }, b: { completedAt: string; id: string }): number {
  // The reverse of the completed log's tie-break, so the two views agree on which row is newer.
  return a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function taskAtRecord(record: OccurrenceRecord): Task {
  const snap = record.snapshot;
  return {
    id: record.taskId,
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
    subtasks: snap.subtasks.map((subtask) => ({ ...subtask })),
    tags: snap.tagIds.map((id) => ({ id, name: '' })),
  };
}

function effectOf(record: OccurrenceRecord, historyCount: number): TaskHistoryEffect {
  const planned = planOccurrence({
    id: record.id,
    task: taskAtRecord(record),
    kind: record.kind,
    on: record.completedOn,
    now: record.completedAt,
    historyCount,
    sortKey: record.snapshot.sortKey,
  });
  return {
    outcome: planned.outcome,
    status: planned.task.status,
    dueDate: planned.task.dueDate ?? null,
    startDate: planned.task.startDate ?? null,
    hideUntil: planned.task.hideUntil ?? null,
    completedOn: planned.task.completedOn ?? null,
  };
}

function canUndo(task: Task, record: OccurrenceRecord, historyCount: number, sortKey: string | null): boolean {
  try {
    planUndoOccurrence(task, record, historyCount, sortKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * One task's completions and skips, oldest first. Other tasks' rows are ignored.
 * `sortKey` is the task's current board position, which undo checks along with the fields.
 * Pass the rows in any order; the result is ordered by the day they were recorded.
 */
export function taskHistory(task: Task, records: readonly OccurrenceRecord[], sortKey: string | null): TaskHistoryEntry[] {
  const mine = records.filter((record) => record.taskId === task.id).sort(compareOldest);
  return mine.map((record, index) => ({
    id: record.id,
    taskId: record.taskId,
    kind: record.kind,
    action: record.kind === 'skip' ? 'skipped' : 'completed',
    label: record.kind === 'skip' ? 'Skipped' : 'Done',
    occurrenceDue: record.occurrenceDue,
    completedOn: record.completedOn,
    completedAt: record.completedAt,
    effect: effectOf(record, index),
    undoable: index === mine.length - 1 && canUndo(task, record, index, sortKey),
  }));
}

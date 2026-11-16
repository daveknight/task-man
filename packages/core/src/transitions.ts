import { DEFAULT_POLICY, type Policy } from './policy.ts';
import type { ISODate, Task } from './types.ts';

export interface DueDateChange<T extends Task> {
  task: T;
  /** Set when the start date had to move to keep start <= due; the UI shows "Start moved to …" with Undo. */
  startMoved?: { from: ISODate; to: ISODate };
}

/** Sets or clears the due date, keeping the start date on or before it according to the policy. */
export function setDueDate<T extends Task>(task: T, dueDate: ISODate | null, policy: Policy = DEFAULT_POLICY): DueDateChange<T> {
  const start = task.startDate ?? null;
  if (dueDate === null || start === null || start <= dueDate) {
    return { task: { ...task, dueDate } };
  }
  if (policy.dueBeforeStart === 'reject') {
    throw new Error(`Due date ${dueDate} is before the start date ${start}`);
  }
  return { task: { ...task, dueDate, startDate: dueDate }, startMoved: { from: start, to: dueDate } };
}

/** Resume: the blocker cleared. Waiting fields clear; the start date is unchanged. */
export function resume<T extends Task>(task: T, policy: Policy = DEFAULT_POLICY): T {
  return { ...task, status: policy.resumeStatus, waitingOn: null, waitUntil: null };
}

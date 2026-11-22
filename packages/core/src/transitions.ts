import { DEFAULT_POLICY, type Policy } from './policy.ts';
import type { ISODate, Status, Task } from './types.ts';

export interface DueDateChange<T extends Task> {
  task: T;
  /** Set when the start date had to move to keep start <= due; the UI shows "Start moved to …" with Undo. */
  startMoved?: { from: ISODate; to: ISODate };
}

/**
 * Sets or clears the due date, keeping the start date on or before it according to the policy.
 * Only Open tasks have a start date, so a Waiting task's hide-until date, which may be after the due
 * date, is never touched.
 */
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

/** Hide until: the task is Waiting, with the picked date (or none). Not capped by the due date. Clears the start date. */
export function waitUntil<T extends Task>(task: T, hideUntil: ISODate | null): T {
  return { ...task, status: 'waiting', startDate: null, hideUntil };
}

/**
 * Changes the status and clears the dates that no longer apply, without asking. Going into Waiting or
 * In Progress clears the start date (only Open tasks have one); leaving Waiting clears the hide-until
 * date, so a task going to Ready is Ready right away. Going into Waiting leaves `hideUntil` for the
 * Hide until picker (`waitUntil`) to set.
 */
export function changeStatus<T extends Task>(task: T, to: Status): T {
  if (task.status === to) return task;
  return {
    ...task,
    status: to,
    startDate: to === 'open' ? (task.startDate ?? null) : null,
    hideUntil: to === 'waiting' ? (task.hideUntil ?? null) : null,
  };
}

/** Move to In Progress: the blocker cleared, so the task leaves Waiting for the policy's status. */
export function resume<T extends Task>(task: T, policy: Policy = DEFAULT_POLICY): T {
  return changeStatus(task, policy.resumeStatus);
}

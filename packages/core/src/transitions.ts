import { DEFAULT_POLICY, type Policy } from './policy.ts';
import type { ISODate, Status, Task } from './types.ts';

export interface DueDateChange<T extends Task> {
  task: T;
  /** Set when the start date had to move to keep start <= due; the UI shows "Start moved to …" with Undo. */
  startMoved?: { from: ISODate; to: ISODate };
}

/**
 * Sets or clears the due date, keeping the start date on or before it according to the policy.
 * A Waiting task's start date is its hide-until date, which may be after the due date, so it never moves.
 */
export function setDueDate<T extends Task>(task: T, dueDate: ISODate | null, policy: Policy = DEFAULT_POLICY): DueDateChange<T> {
  const start = task.startDate ?? null;
  if (dueDate === null || start === null || start <= dueDate || task.status === 'waiting') {
    return { task: { ...task, dueDate } };
  }
  if (policy.dueBeforeStart === 'reject') {
    throw new Error(`Due date ${dueDate} is before the start date ${start}`);
  }
  return { task: { ...task, dueDate, startDate: dueDate }, startMoved: { from: start, to: dueDate } };
}

/** Hide until: the picked date (or none) becomes the start date. Not capped by the due date. */
export function waitUntil<T extends Task>(task: T, checkBack: ISODate | null): T {
  return { ...task, status: 'waiting', startDate: checkBack };
}

/** What to do with the start date when a status change needs a choice. */
export type StartChoice = 'clear' | 'keep' | { set: ISODate };

export type StartDecisionReason =
  /** Leaving Waiting while the hide-until date is in the future and not after the due date. */
  | 'leaving_waiting_future_start'
  /** Leaving Waiting while the hide-until date is after the due date (allowed only while Waiting). */
  | 'leaving_waiting_start_after_due'
  /** Going into Waiting with a future start date, which would become the hide-until date. */
  | 'entering_waiting_future_start';

/** The question a client must ask (or a script must answer up front) before the status can change. */
export interface StartDecision {
  reason: StartDecisionReason;
  startDate: ISODate;
  dueDate: ISODate | null;
  options: ('clear' | 'keep' | 'set')[];
  /** The highlighted answer, from the policy. Always one of `options`. */
  default: 'clear' | 'keep';
}

export type StatusChange<T extends Task> = { task: T; decision?: never } | { task?: never; decision: StartDecision };

/**
 * Changes the status without silently changing dates. When the start date is ambiguous, returns
 * `decision` instead of a task; call again with `choice` (the user's answer, or a script's flag).
 * A `choice` given when no decision is needed is ignored.
 */
export function changeStatus<T extends Task>(
  task: T,
  to: Status,
  today: ISODate,
  choice?: StartChoice,
  policy: Policy = DEFAULT_POLICY,
): StatusChange<T> {
  const from = task.status;
  const start = task.startDate ?? null;
  const due = task.dueDate ?? null;
  if (from === to) return { task };

  let decision: StartDecision | null = null;
  if (from === 'waiting' && start) {
    const afterDue = !!due && start > due;
    if (afterDue) {
      decision = { reason: 'leaving_waiting_start_after_due', startDate: start, dueDate: due, options: ['clear'], default: 'clear' };
    } else if (start > today) {
      decision = { reason: 'leaving_waiting_future_start', startDate: start, dueDate: due, options: ['clear', 'keep', 'set'], default: policy.leaveWaitingDefault };
    }
  } else if (to === 'waiting' && start && start > today) {
    decision = { reason: 'entering_waiting_future_start', startDate: start, dueDate: due, options: ['clear', 'keep', 'set'], default: policy.enterWaitingDefault };
  }

  if (!decision) {
    // Starting work on an Upcoming task is "Start now": the future start date no longer applies.
    if (to === 'in_progress' && start && start > today) return { task: { ...task, status: to, startDate: null } };
    return { task: { ...task, status: to } };
  }
  if (choice === undefined) return { decision };
  if (choice === 'clear') return { task: { ...task, status: to, startDate: null } };
  if (choice === 'keep') {
    if (!decision.options.includes('keep')) throw new Error(`Can't keep the hide-until date ${start} after the due date ${due} outside Waiting`);
    return { task: { ...task, status: to } };
  }
  if (!decision.options.includes('set')) {
    throw new Error(`Can't set a start date when the hide-until date ${start} is after the due date ${due}; clear it instead`);
  }
  if (to !== 'waiting' && due && choice.set > due) throw new Error(`Start ${choice.set} is after the due date ${due}`);
  return { task: { ...task, status: to, startDate: choice.set } };
}

/** Resume: the blocker cleared, so the task leaves Waiting for the policy's status. */
export function resume<T extends Task>(task: T, today: ISODate, choice?: StartChoice, policy: Policy = DEFAULT_POLICY): StatusChange<T> {
  return changeStatus(task, policy.resumeStatus, today, choice, policy);
}

import type { ISODate, Placement, Section, Task, WaitingState } from './types.ts';

/**
 * The board section a task belongs in on `today`. Derived, never stored.
 * Precedence: Trash, then Completed, then Waiting (whatever its hide-until date), then status.
 * Only an Open task has a start date, so only an Open task can be in Upcoming.
 */
export function sectionFor(task: Task, today: ISODate): Section {
  if (task.deletedAt) return 'trash';
  if (task.completedAt) return 'completed';
  if (task.status === 'waiting') return 'waiting';
  if (task.status === 'in_progress') return 'in_progress';
  return task.startDate && task.startDate > today ? 'upcoming' : 'ready';
}

/**
 * A waiting task needs follow-up when its hide-until date is empty or has arrived, or the due date
 * has arrived; otherwise it stays hidden until later.
 */
export function waitingStateFor(task: Task, today: ISODate): WaitingState {
  if (!task.hideUntil || task.hideUntil <= today) return 'needs_follow_up';
  if (task.dueDate && task.dueDate <= today) return 'needs_follow_up';
  return 'later';
}

export function placementFor(task: Task, today: ISODate): Placement {
  const section = sectionFor(task, today);
  if (section === 'waiting' && waitingStateFor(task, today) === 'later') return 'waiting_later';
  return section;
}

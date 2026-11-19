import type { ISODate, Placement, Section, Task, WaitingState } from './types.ts';

/**
 * The board section a task belongs in on `today`. Derived, never stored.
 * Precedence: Trash, then Completed, then Waiting (whatever its start date), then a future start
 * date (Upcoming), then status.
 */
export function sectionFor(task: Task, today: ISODate): Section {
  if (task.deletedAt) return 'trash';
  if (task.completedAt) return 'completed';
  if (task.status === 'waiting') return 'waiting';
  if (task.startDate && task.startDate > today) return 'upcoming';
  switch (task.status) {
    case 'in_progress':
      return 'in_progress';
    default:
      return 'ready';
  }
}

/**
 * A waiting task's start date is its hide-until date. It needs follow-up when that's empty or has
 * arrived, or the due date has arrived; otherwise it stays hidden until later.
 */
export function waitingStateFor(task: Task, today: ISODate): WaitingState {
  if (!task.startDate || task.startDate <= today) return 'needs_follow_up';
  if (task.dueDate && task.dueDate <= today) return 'needs_follow_up';
  return 'later';
}

export function placementFor(task: Task, today: ISODate): Placement {
  const section = sectionFor(task, today);
  if (section === 'waiting' && waitingStateFor(task, today) === 'later') return 'waiting_later';
  return section;
}

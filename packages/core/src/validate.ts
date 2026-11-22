import { isValidDate } from './dates.ts';
import { STATUSES, type Task } from './types.ts';

/** A start date after the due date. Hide until isn't covered: it may fall after the due date. */
export function startAfterDue(task: Partial<Task>): boolean {
  return !!task.startDate && !!task.dueDate && isValidDate(task.startDate) && isValidDate(task.dueDate) && task.startDate > task.dueDate;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

const DATE_FIELDS = ['startDate', 'hideUntil', 'dueDate', 'completedOn', 'deletedOn'] as const;

/** Checks a task before any write. An empty list means it's valid. */
export function validateTask(task: Partial<Task>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof task.title !== 'string' || task.title.trim() === '') {
    issues.push({ field: 'title', message: 'Title is required' });
  }
  if (task.status !== undefined && !STATUSES.includes(task.status)) {
    issues.push({ field: 'status', message: `Unknown status ${JSON.stringify(task.status)}` });
  }
  for (const field of DATE_FIELDS) {
    const value = task[field];
    if (value != null && !isValidDate(value)) {
      issues.push({ field, message: `Not a valid date: ${JSON.stringify(value)}` });
    }
  }
  if (task.startDate && (task.status ?? 'open') !== 'open') {
    issues.push({ field: 'startDate', message: 'Start dates only apply to Ready and Upcoming tasks' });
  }
  if (task.hideUntil && task.status !== 'waiting') {
    issues.push({ field: 'hideUntil', message: 'Hide until only applies to Waiting tasks' });
  }
  if (startAfterDue(task) && (task.status ?? 'open') === 'open') {
    issues.push({ field: 'startDate', message: 'Start date must be on or before the due date' });
  }
  if (!!task.completedAt !== !!task.completedOn) {
    issues.push({ field: 'completedOn', message: 'completedAt and completedOn must be set together' });
  }
  if (!!task.deletedAt !== !!task.deletedOn) {
    issues.push({ field: 'deletedOn', message: 'deletedAt and deletedOn must be set together' });
  }
  return issues;
}

import type { EditableField, ISODate, Status, Subtask, Task, TaskPatch } from '@app/core';

/** A public.tasks row as PostgREST returns it. */
export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: Status;
  flagged: boolean;
  start_date: ISODate | null;
  hide_until: ISODate | null;
  due_date: ISODate | null;
  repeat: unknown;
  completed_at: string | null;
  completed_on: ISODate | null;
  deleted_at: string | null;
  deleted_on: ISODate | null;
  created_at: string;
  updated_at?: string;
}

export const TASK_COLUMNS =
  'id,user_id,title,description,status,flagged,start_date,hide_until,due_date,repeat,completed_at,completed_on,deleted_at,deleted_on,created_at,updated_at';

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    flagged: row.flagged,
    startDate: row.start_date,
    hideUntil: row.hide_until,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    completedOn: row.completed_on,
    deletedAt: row.deleted_at,
    deletedOn: row.deleted_on,
    createdAt: row.created_at,
  };
}

const COLUMN: Record<EditableField, keyof TaskRow> = {
  title: 'title',
  description: 'description',
  status: 'status',
  flagged: 'flagged',
  startDate: 'start_date',
  hideUntil: 'hide_until',
  dueDate: 'due_date',
  completedAt: 'completed_at',
  completedOn: 'completed_on',
  deletedAt: 'deleted_at',
  deletedOn: 'deleted_on',
};

/** Column names for a patch of changed fields. */
export function patchToRow(patch: TaskPatch): Partial<TaskRow> {
  const row: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) row[COLUMN[field as EditableField]] = value ?? (field === 'description' ? '' : null);
  return row as Partial<TaskRow>;
}

/** A row to insert for a new task (the database sets created_at and updated_at). */
export function rowForInsert(task: Task, userId: string): Omit<TaskRow, 'created_at' | 'updated_at' | 'repeat'> {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    flagged: task.flagged ?? false,
    start_date: task.startDate ?? null,
    hide_until: task.hideUntil ?? null,
    due_date: task.dueDate ?? null,
    completed_at: task.completedAt ?? null,
    completed_on: task.completedOn ?? null,
    deleted_at: task.deletedAt ?? null,
    deleted_on: task.deletedOn ?? null,
  };
}

/** A public.subtasks row as PostgREST returns it. */
export interface SubtaskRow {
  id: string;
  user_id: string;
  task_id: string;
  title: string;
  done: boolean;
  sort_key: string;
  created_at?: string;
  updated_at?: string;
}

export const SUBTASK_COLUMNS = 'id,user_id,task_id,title,done,sort_key';

export function subtaskFromRow(row: Pick<SubtaskRow, 'id' | 'title' | 'done' | 'sort_key'>): Subtask {
  return { id: row.id, title: row.title, done: row.done, sortKey: row.sort_key };
}

export function subtaskRow(subtask: Subtask, taskId: string, userId: string): Omit<SubtaskRow, 'created_at' | 'updated_at'> {
  return { id: subtask.id, user_id: userId, task_id: taskId, title: subtask.title, done: subtask.done, sort_key: subtask.sortKey };
}

import type { ISODate, Status, Task } from '@app/core';

/** A public.tasks row as PostgREST returns it. */
export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: Status;
  wait_until: ISODate | null;
  flagged: boolean;
  start_date: ISODate | null;
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
  'id,user_id,title,description,status,wait_until,flagged,start_date,due_date,repeat,completed_at,completed_on,deleted_at,deleted_on,created_at,updated_at';

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    waitUntil: row.wait_until,
    flagged: row.flagged,
    startDate: row.start_date,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    completedOn: row.completed_on,
    deletedAt: row.deleted_at,
    deletedOn: row.deleted_on,
    createdAt: row.created_at,
  };
}

import type { ActivityRecord, EditableField, ISODate, OccurrenceRecord, OccurrenceSnapshot, RepeatRule, Status, Subtask, Tag, Task, TaskPatch } from '@app/core';

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
    repeat: repeatFromJson(row.repeat),
  };
}

function repeatFromJson(value: unknown): RepeatRule | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as RepeatRule;
}

const COLUMN: Record<EditableField, keyof TaskRow> = {
  title: 'title',
  description: 'description',
  status: 'status',
  flagged: 'flagged',
  startDate: 'start_date',
  hideUntil: 'hide_until',
  dueDate: 'due_date',
  repeat: 'repeat',
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
export function rowForInsert(task: Task, userId: string): Omit<TaskRow, 'created_at' | 'updated_at'> {
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
    repeat: task.repeat ?? null,
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

/** A public.tags row as PostgREST returns it. (The table also has an unused `color` column.) */
export interface TagRow {
  id: string;
  user_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export const TAG_COLUMNS = 'id,user_id,name';

export function tagFromRow(row: Pick<TagRow, 'id' | 'name'>): Tag {
  return { id: row.id, name: row.name };
}

/** A public.task_tags row: one tag on one task. `created_at` orders a task's chips. */
export interface TaskTagRow {
  user_id: string;
  task_id: string;
  tag_id: string;
  created_at?: string;
}

export const TASK_TAG_COLUMNS = 'task_id,tag_id,created_at';

/** One recorded completion or skip of a repeating task. */
export interface CompletionRow {
  id: string;
  task_id: string;
  occurrence_due: ISODate;
  kind: 'done' | 'skip';
  completed_on: ISODate;
  completed_at: string;
  snapshot: OccurrenceSnapshot;
  created_at?: string;
}

export const COMPLETION_COLUMNS = 'id,task_id,occurrence_due,kind,completed_on,completed_at,snapshot,created_at';

/** A public.task_activities row as PostgREST returns it. */
export interface ActivityRow {
  id: string;
  user_id: string;
  task_id: string;
  batch_id: string;
  seq: number;
  at: string;
  kind: 'created' | 'changed';
  field: string;
  before: unknown;
  after: unknown;
}

export const ACTIVITY_COLUMNS = 'id,user_id,task_id,batch_id,seq,at,kind,field,before,after';

export function activityFromRow(row: ActivityRow): ActivityRecord {
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    batchId: row.batch_id,
    seq: row.seq,
    at: row.at,
    kind: row.kind,
    field: row.field,
    before: row.before,
    after: row.after,
  };
}

export function completionFromRow(row: CompletionRow): OccurrenceRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    occurrenceDue: row.occurrence_due,
    kind: row.kind,
    completedOn: row.completed_on,
    completedAt: row.completed_at,
    snapshot: row.snapshot,
  };
}

/** Link rows for tags added together. Each gets a millisecond more than the last, so the chips keep the order they were given. */
export function taskTagRows(tags: readonly Tag[], taskId: string, userId: string, start: number = Date.now()): Required<TaskTagRow>[] {
  return tags.map((tag, i) => ({ user_id: userId, task_id: taskId, tag_id: tag.id, created_at: new Date(start + i).toISOString() }));
}

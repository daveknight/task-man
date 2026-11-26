import { MAIN_VIEW_ID, OCCURRENCE_ALREADY_RECORDED, assertValid, orderTaskTags, sortSubtasks, sortTags, taskPatch, type ChangePlan, type ISODate, type OccurrencePlan, type OccurrenceRecord, type PositionWrite, type Subtask, type SubtaskChange, type Tag, type TagChange, type TagLink, type Task, type TaskTagChange, type UndoPlan } from '@app/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { drainFileDeletions } from './attachments.ts';
import {
  COMPLETION_COLUMNS,
  completionFromRow,
  patchToRow,
  rowForInsert,
  subtaskFromRow,
  subtaskRow,
  SUBTASK_COLUMNS,
  TAG_COLUMNS,
  tagFromRow,
  TASK_COLUMNS,
  TASK_TAG_COLUMNS,
  taskFromRow,
  taskTagRows,
  type CompletionRow,
  type SubtaskRow,
  type TagRow,
  type TaskRow,
  type TaskTagRow,
} from './rows.ts';

/**
 * Every query filters by user_id. The web app's client is signed in, so row-level security would
 * scope it anyway; the CLI uses the service key, which bypasses RLS, so the filter is what scopes it.
 */
export interface Scope {
  db: SupabaseClient;
  userId: string;
}

export interface Snapshot {
  tasks: Task[];
  /** Sort keys for the main board, by task id. */
  positions: Map<string, string>;
  /** Every tag, in name order, including ones no task has. */
  tags: Tag[];
  /** Completions and skips, oldest first, so the last one for a task is the one undo restores. */
  completions: OccurrenceRecord[];
}

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** PostgREST returns at most 1000 rows a request, so a user's subtasks are read a page at a time. */
const PAGE = 1000;

async function selectSubtasks({ db, userId }: Scope, taskIds?: readonly string[]): Promise<SubtaskRow[]> {
  const rows: SubtaskRow[] = [];
  // A filter on task ids goes in the URL, so a long list is asked for in chunks.
  const chunks = taskIds ? Array.from({ length: Math.ceil(taskIds.length / 100) }, (_, i) => taskIds.slice(i * 100, i * 100 + 100)) : [undefined];
  for (const ids of chunks) {
    for (let from = 0; ; from += PAGE) {
      let query = db.from('subtasks').select(SUBTASK_COLUMNS).eq('user_id', userId);
      if (ids) query = query.in('task_id', ids);
      const { data, error } = await query.order('id').range(from, from + PAGE - 1).returns<SubtaskRow[]>();
      fail('select subtasks', error);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGE) break;
    }
  }
  return rows;
}

/** Attaches each task's subtasks, in order. A task with none gets an empty list. */
function withSubtasks(tasks: Task[], rows: readonly SubtaskRow[]): Task[] {
  const byTask = new Map<string, Subtask[]>();
  for (const row of rows) {
    const list = byTask.get(row.task_id) ?? [];
    list.push(subtaskFromRow(row));
    byTask.set(row.task_id, list);
  }
  return tasks.map((t) => ({ ...t, subtasks: sortSubtasks(byTask.get(t.id)) }));
}

async function selectTags({ db, userId }: Scope): Promise<Tag[]> {
  const { data, error } = await db.from('tags').select(TAG_COLUMNS).eq('user_id', userId).limit(PAGE).returns<TagRow[]>();
  fail('select tags', error);
  return sortTags((data ?? []).map(tagFromRow));
}

async function selectTaskTags({ db, userId }: Scope, taskIds?: readonly string[]): Promise<Pick<TaskTagRow, 'task_id' | 'tag_id' | 'created_at'>[]> {
  const rows: Pick<TaskTagRow, 'task_id' | 'tag_id' | 'created_at'>[] = [];
  const chunks = taskIds ? Array.from({ length: Math.ceil(taskIds.length / 100) }, (_, i) => taskIds.slice(i * 100, i * 100 + 100)) : [undefined];
  for (const ids of chunks) {
    for (let from = 0; ; from += PAGE) {
      let query = db.from('task_tags').select(TASK_TAG_COLUMNS).eq('user_id', userId);
      if (ids) query = query.in('task_id', ids);
      const { data, error } = await query.order('task_id').order('tag_id').range(from, from + PAGE - 1).returns<Pick<TaskTagRow, 'task_id' | 'tag_id' | 'created_at'>[]>();
      fail('select task tags', error);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGE) break;
    }
  }
  return rows;
}

/** Attaches each task's tags, in the order they were added. A task with none gets an empty list. */
function withTags(tasks: Task[], links: readonly Pick<TaskTagRow, 'task_id' | 'tag_id' | 'created_at'>[], catalog: readonly Tag[]): Task[] {
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const byTask = new Map<string, TagLink[]>();
  for (const link of links) {
    const tag = byId.get(link.tag_id);
    if (!tag) continue;
    const list = byTask.get(link.task_id) ?? [];
    list.push({ tag, attachedAt: link.created_at ?? '' });
    byTask.set(link.task_id, list);
  }
  return tasks.map((t) => ({ ...t, tags: orderTaskTags(byTask.get(t.id) ?? []) }));
}

async function selectCompletions({ db, userId }: Scope): Promise<CompletionRow[]> {
  const rows: CompletionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('task_completions')
      .select(COMPLETION_COLUMNS)
      .eq('user_id', userId)
      .order('created_at')
      .order('id')
      .range(from, from + PAGE - 1)
      .returns<CompletionRow[]>();
    fail('select completions', error);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return rows;
}

export async function loadSnapshot(scope: Scope): Promise<Snapshot> {
  const { db, userId } = scope;
  const [tasks, positions, subtasks, tags, links, completions] = await Promise.all([
    db.from('tasks').select(TASK_COLUMNS).eq('user_id', userId).returns<TaskRow[]>(),
    db.from('task_positions').select('task_id,sort_key').eq('user_id', userId).eq('view_id', MAIN_VIEW_ID).returns<{ task_id: string; sort_key: string }[]>(),
    selectSubtasks(scope),
    selectTags(scope),
    selectTaskTags(scope),
    selectCompletions(scope),
  ]);
  fail('select tasks', tasks.error);
  fail('select positions', positions.error);
  return {
    tasks: withTags(withSubtasks((tasks.data ?? []).map(taskFromRow), subtasks), links, tags),
    positions: new Map((positions.data ?? []).map((p) => [p.task_id, p.sort_key])),
    tags,
    completions: completions.map(completionFromRow),
  };
}

/** Records one completion or skip, then advances the task (or completes it, when the repeat ends). */
export async function writeOccurrence(scope: Scope, before: Task, plan: OccurrencePlan): Promise<void> {
  assertValid(plan.task);
  const { db, userId } = scope;
  const record = plan.record;
  const inserted = await db.from('task_completions').insert({
    id: record.id,
    user_id: userId,
    task_id: record.taskId,
    occurrence_due: record.occurrenceDue,
    kind: record.kind,
    completed_on: record.completedOn,
    completed_at: record.completedAt,
    snapshot: record.snapshot,
  });
  if (inserted.error?.code === '23505') throw new Error(OCCURRENCE_ALREADY_RECORDED);
  fail('record occurrence', inserted.error);
  await writeChange(scope, before.id, { patch: taskPatch(before, plan.task), positions: [], clearPosition: plan.clearPosition });
  for (const id of plan.resetSubtaskIds) {
    await writeSubtaskChange(scope, before.id, { kind: 'edit', id, patch: { done: false } });
  }
}

/** Deletes the history row and puts the task, its subtasks and its position back. */
export async function writeUndoOccurrence(scope: Scope, current: Task, plan: UndoPlan): Promise<void> {
  assertValid(plan.task);
  const { db, userId } = scope;
  fail('undo occurrence', (await db.from('task_completions').delete().eq('user_id', userId).eq('id', plan.completionId)).error);
  await writeChange(scope, plan.task.id, {
    patch: taskPatch(current, plan.task),
    positions: plan.sortKey ? [{ taskId: plan.task.id, sortKey: plan.sortKey }] : [],
    clearPosition: plan.sortKey == null,
  });
  for (const edit of plan.subtaskDone) {
    await writeSubtaskChange(scope, plan.task.id, { kind: 'edit', id: edit.id, patch: { done: edit.done } });
  }
}

export async function writePositions({ db, userId }: Scope, writes: readonly PositionWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const { error } = await db
    .from('task_positions')
    .upsert(writes.map((w) => ({ user_id: userId, view_id: MAIN_VIEW_ID, task_id: w.taskId, sort_key: w.sortKey })), { onConflict: 'view_id,task_id' });
  fail('write positions', error);
}

/** Writes a planned change: only the changed fields, then the position rows. */
export async function writeChange(scope: Scope, taskId: string, plan: ChangePlan): Promise<void> {
  const { db, userId } = scope;
  if (Object.keys(plan.patch).length > 0) {
    const { error } = await db.from('tasks').update(patchToRow(plan.patch)).eq('user_id', userId).eq('id', taskId);
    fail('update task', error);
  }
  if (plan.clearPosition) {
    const { error } = await db.from('task_positions').delete().eq('user_id', userId).eq('view_id', MAIN_VIEW_ID).eq('task_id', taskId);
    fail('clear position', error);
  }
  await writePositions(scope, plan.positions);
}

export async function insertTask(scope: Scope, task: Task, positions: readonly PositionWrite[]): Promise<Task> {
  const { data, error } = await scope.db.from('tasks').insert(rowForInsert(task, scope.userId)).select(TASK_COLUMNS).single<TaskRow>();
  fail('insert task', error);
  await writePositions(scope, positions);
  const subtasks = task.subtasks ?? [];
  if (subtasks.length > 0) {
    const { error: subtaskError } = await scope.db.from('subtasks').insert(subtasks.map((s) => subtaskRow(s, task.id, scope.userId)));
    fail('insert subtasks', subtaskError);
  }
  const tags = task.tags ?? [];
  if (tags.length > 0) {
    const { error: tagError } = await scope.db.from('task_tags').insert(taskTagRows(tags, task.id, scope.userId));
    fail('insert task tags', tagError);
  }
  return { ...taskFromRow(data!), subtasks: sortSubtasks(subtasks), tags };
}

/** One write to the tag list: create, rename or delete. Deleting also removes the tag from every task (the links cascade). */
export async function writeTagChange({ db, userId }: Scope, change: TagChange): Promise<void> {
  const table = () => db.from('tags');
  switch (change.kind) {
    case 'create':
      fail('create tag', (await table().insert({ id: change.tag.id, user_id: userId, name: change.tag.name })).error);
      return;
    case 'rename':
      fail('rename tag', (await table().update({ name: change.name }).eq('user_id', userId).eq('id', change.id)).error);
      return;
    case 'delete':
      fail('delete tag', (await table().delete().eq('user_id', userId).eq('id', change.id)).error);
      return;
  }
}

/** One tag on or off a task: a single link row, so edits on two devices both survive. Adding a tag already there does nothing. */
export async function writeTaskTagChange({ db, userId }: Scope, taskId: string, change: TaskTagChange): Promise<void> {
  if (change.kind === 'attach') {
    const link = { user_id: userId, task_id: taskId, tag_id: change.tag.id };
    fail('add tag', (await db.from('task_tags').upsert(link, { onConflict: 'task_id,tag_id', ignoreDuplicates: true })).error);
    return;
  }
  fail('remove tag', (await db.from('task_tags').delete().eq('user_id', userId).eq('task_id', taskId).eq('tag_id', change.tagId)).error);
}

/** One subtask write: a single row, so edits to different subtasks on two devices both survive. */
export async function writeSubtaskChange({ db, userId }: Scope, taskId: string, change: SubtaskChange): Promise<void> {
  const table = () => db.from('subtasks');
  switch (change.kind) {
    case 'add':
      fail('add subtask', (await table().insert(subtaskRow(change.subtask, taskId, userId))).error);
      return;
    case 'edit':
      fail('edit subtask', (await table().update(change.patch).eq('user_id', userId).eq('task_id', taskId).eq('id', change.id)).error);
      return;
    case 'move':
      fail('move subtask', (await table().update({ sort_key: change.sortKey }).eq('user_id', userId).eq('task_id', taskId).eq('id', change.id)).error);
      return;
    case 'remove':
      fail('remove subtask', (await table().delete().eq('user_id', userId).eq('task_id', taskId).eq('id', change.id)).error);
      return;
  }
}

/** Delete forever: removes the row (and its files). The database writes a tombstone and queues the objects. */
export async function deleteForever(scope: Scope, taskId: string): Promise<void> {
  const { db, userId } = scope;
  const { error } = await db.from('tasks').delete().eq('user_id', userId).eq('id', taskId);
  fail('delete task', error);
  await drainFileDeletions(scope);
}

export interface SearchOptions {
  completed?: boolean;
  flagged?: boolean;
  /** Only tasks that have every one of these tags. */
  tagIds?: readonly string[];
}

/** Title, description and tag-name search (full-text plus partial words), optionally narrowed to tasks with every selected tag. Never includes Trash. */
export async function searchTasks(scope: Scope, query: string, options: SearchOptions = {}): Promise<Task[]> {
  const { db, userId } = scope;
  const { data, error } = await db
    .rpc('search_tasks', { query, include_completed: options.completed ?? false, flagged_only: options.flagged ?? false, tag_ids: [...(options.tagIds ?? [])] })
    .eq('user_id', userId);
  fail('search', error);
  const tasks = ((data ?? []) as TaskRow[]).map(taskFromRow);
  if (tasks.length === 0) return tasks;
  const ids = tasks.map((t) => t.id);
  const [subtasks, links, tags] = await Promise.all([selectSubtasks(scope, ids), selectTaskTags(scope, ids), selectTags(scope)]);
  return withTags(withSubtasks(tasks, subtasks), links, tags);
}

/**
 * The same tasks as the daily job, for one user, plus the files those tasks held.
 * The daily job only queues the objects (Storage refuses a SQL delete); this also
 * removes them. Needs the service key for `purge_trash`.
 */
export async function purgeTrash(scope: Scope, today: ISODate): Promise<string[]> {
  const { db, userId } = scope;
  const { data, error } = await db.rpc('purge_trash', { today, only_user: userId });
  fail('purge trash', error);
  await drainFileDeletions(scope);
  return (data ?? []) as string[];
}

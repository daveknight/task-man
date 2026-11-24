import { MAIN_VIEW_ID, sortSubtasks, type ChangePlan, type ISODate, type PositionWrite, type Subtask, type SubtaskChange, type Task } from '@app/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { patchToRow, rowForInsert, subtaskFromRow, subtaskRow, SUBTASK_COLUMNS, TASK_COLUMNS, taskFromRow, type SubtaskRow, type TaskRow } from './rows.ts';

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

export async function loadSnapshot(scope: Scope): Promise<Snapshot> {
  const { db, userId } = scope;
  const [tasks, positions, subtasks] = await Promise.all([
    db.from('tasks').select(TASK_COLUMNS).eq('user_id', userId).returns<TaskRow[]>(),
    db.from('task_positions').select('task_id,sort_key').eq('user_id', userId).eq('view_id', MAIN_VIEW_ID).returns<{ task_id: string; sort_key: string }[]>(),
    selectSubtasks(scope),
  ]);
  fail('select tasks', tasks.error);
  fail('select positions', positions.error);
  return {
    tasks: withSubtasks((tasks.data ?? []).map(taskFromRow), subtasks),
    positions: new Map((positions.data ?? []).map((p) => [p.task_id, p.sort_key])),
  };
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
  return { ...taskFromRow(data!), subtasks: sortSubtasks(subtasks) };
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

/** Delete forever: removes the row; the database writes a tombstone. */
export async function deleteForever({ db, userId }: Scope, taskId: string): Promise<void> {
  const { error } = await db.from('tasks').delete().eq('user_id', userId).eq('id', taskId);
  fail('delete task', error);
}

export interface SearchOptions {
  completed?: boolean;
  flagged?: boolean;
}

/** Title and description search (full-text plus partial words). Never includes Trash. */
export async function searchTasks(scope: Scope, query: string, options: SearchOptions = {}): Promise<Task[]> {
  const { db, userId } = scope;
  const { data, error } = await db
    .rpc('search_tasks', { query, include_completed: options.completed ?? false, flagged_only: options.flagged ?? false })
    .eq('user_id', userId);
  fail('search', error);
  const tasks = ((data ?? []) as TaskRow[]).map(taskFromRow);
  return tasks.length === 0 ? tasks : withSubtasks(tasks, await selectSubtasks(scope, tasks.map((t) => t.id)));
}

/** The same code path as the daily job, for one user. Needs the service key. */
export async function purgeTrash({ db, userId }: Scope, today: ISODate): Promise<string[]> {
  const { data, error } = await db.rpc('purge_trash', { today, only_user: userId });
  fail('purge trash', error);
  return (data ?? []) as string[];
}

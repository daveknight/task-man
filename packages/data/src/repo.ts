import { MAIN_VIEW_ID, type ChangePlan, type ISODate, type PositionWrite, type Task } from '@app/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { patchToRow, rowForInsert, TASK_COLUMNS, taskFromRow, type TaskRow } from './rows.ts';

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

export async function loadSnapshot({ db, userId }: Scope): Promise<Snapshot> {
  const [tasks, positions] = await Promise.all([
    db.from('tasks').select(TASK_COLUMNS).eq('user_id', userId).returns<TaskRow[]>(),
    db.from('task_positions').select('task_id,sort_key').eq('user_id', userId).eq('view_id', MAIN_VIEW_ID).returns<{ task_id: string; sort_key: string }[]>(),
  ]);
  fail('select tasks', tasks.error);
  fail('select positions', positions.error);
  return {
    tasks: (tasks.data ?? []).map(taskFromRow),
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
  return taskFromRow(data!);
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
export async function searchTasks({ db, userId }: Scope, query: string, options: SearchOptions = {}): Promise<Task[]> {
  const { data, error } = await db
    .rpc('search_tasks', { query, include_completed: options.completed ?? false, flagged_only: options.flagged ?? false })
    .eq('user_id', userId);
  fail('search', error);
  return ((data ?? []) as TaskRow[]).map(taskFromRow);
}

/** The same code path as the daily job, for one user. Needs the service key. */
export async function purgeTrash({ db, userId }: Scope, today: ISODate): Promise<string[]> {
  const { data, error } = await db.rpc('purge_trash', { today, only_user: userId });
  fail('purge trash', error);
  return (data ?? []) as string[];
}

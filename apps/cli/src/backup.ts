import { SUBTASK_COLUMNS, TASK_COLUMNS, type Scope, type SubtaskRow, type TaskRow } from '@app/data';
import { validateTask } from '@app/core';
import { reset } from './commands.ts';

export type BackupTask = Omit<TaskRow, 'user_id'>;
export type BackupSubtask = Pick<SubtaskRow, 'id' | 'task_id' | 'title' | 'done' | 'sort_key'>;

export interface Backup {
  version: 2;
  exportedAt: string;
  tasks: BackupTask[];
  positions: { view_id: string; task_id: string; sort_key: string }[];
  /** Added with subtasks. A backup from before them has none, and imports without any. */
  subtasks?: BackupSubtask[];
}

/** Version 1 had no `hide_until`: a Waiting task's start date was its hide-until date. */
export interface BackupV1 extends Omit<Backup, 'version' | 'tasks'> {
  version: 1;
  tasks: Omit<BackupTask, 'hide_until'>[];
}

/** Maps a version 1 task the way the hide_until migration does. */
export function upgradeV1Task(row: Omit<BackupTask, 'hide_until'>): BackupTask {
  if (row.status === 'waiting') return { ...row, hide_until: row.start_date, start_date: null };
  if (row.status === 'in_progress') return { ...row, hide_until: null, start_date: null };
  return { ...row, hide_until: null };
}

export function upgradeBackup(backup: Backup | BackupV1): Backup {
  if (backup.version === 2) return backup;
  if (backup.version !== 1) throw new Error(`Unknown backup version ${String((backup as { version: unknown }).version)}`);
  return { ...backup, version: 2, tasks: backup.tasks.map(upgradeV1Task) };
}

/** Everything the user owns that is stored so far: tasks (including completed and Trash), positions and subtasks. */
export async function exportAll({ db, userId }: Scope): Promise<Backup> {
  const tasks = await db.from('tasks').select(TASK_COLUMNS).eq('user_id', userId).order('created_at').order('id').returns<TaskRow[]>();
  if (tasks.error) throw new Error(`export tasks: ${tasks.error.message}`);
  const positions = await db
    .from('task_positions')
    .select('view_id,task_id,sort_key')
    .eq('user_id', userId)
    .order('view_id')
    .order('task_id')
    .returns<Backup['positions']>();
  if (positions.error) throw new Error(`export positions: ${positions.error.message}`);
  const subtasks = await db
    .from('subtasks')
    .select(SUBTASK_COLUMNS)
    .eq('user_id', userId)
    .order('task_id')
    .order('sort_key')
    .order('id')
    .range(0, 9999)
    .returns<SubtaskRow[]>();
  if (subtasks.error) throw new Error(`export subtasks: ${subtasks.error.message}`);
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    tasks: (tasks.data ?? []).map(({ user_id: _, updated_at: __, ...row }) => row),
    positions: positions.data ?? [],
    subtasks: (subtasks.data ?? []).map(({ id, task_id, title, done, sort_key }) => ({ id, task_id, title, done, sort_key })),
  };
}

/** Loads a version 2 backup, or a version 1 one mapped like the migration, for the user. Ids are kept, so it fails if they already exist unless `replace` wipes first. */
export async function importAll(scope: Scope, loaded: Backup | BackupV1, replace: boolean): Promise<{ tasks: number; positions: number; subtasks: number }> {
  const backup = upgradeBackup(loaded);
  for (const row of backup.tasks) {
    const issues = validateTask({
      title: row.title,
      status: row.status,
      startDate: row.start_date,
      hideUntil: row.hide_until,
      dueDate: row.due_date,
      completedAt: row.completed_at,
      completedOn: row.completed_on,
      deletedAt: row.deleted_at,
      deletedOn: row.deleted_on,
    });
    if (issues.length) throw new Error(`Task ${row.id}: ${issues.map((i) => i.message).join('; ')}`);
  }
  if (replace) await reset(scope.db, scope.userId);
  const { db, userId } = scope;
  if (backup.tasks.length) {
    const { error } = await db.from('tasks').insert(backup.tasks.map((t) => ({ ...t, user_id: userId })));
    if (error) throw new Error(`import tasks: ${error.message}${replace ? '' : ' (pass --reset to replace existing data)'}`);
  }
  if (backup.positions.length) {
    const { error } = await db.from('task_positions').insert(backup.positions.map((p) => ({ ...p, user_id: userId })));
    if (error) throw new Error(`import positions: ${error.message}`);
  }
  const subtasks = backup.subtasks ?? [];
  if (subtasks.length) {
    const { error } = await db.from('subtasks').insert(subtasks.map((s) => ({ ...s, user_id: userId })));
    if (error) throw new Error(`import subtasks: ${error.message}`);
  }
  return { tasks: backup.tasks.length, positions: backup.positions.length, subtasks: subtasks.length };
}

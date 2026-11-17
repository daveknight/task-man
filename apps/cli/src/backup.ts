import { TASK_COLUMNS, type Scope, type TaskRow } from '@app/data';
import { validateTask } from '@app/core';
import { reset } from './commands.ts';

export interface Backup {
  version: 1;
  exportedAt: string;
  tasks: Omit<TaskRow, 'user_id'>[];
  positions: { view_id: string; task_id: string; sort_key: string }[];
}

/** Everything the user owns that Phase 1a stores: tasks (including completed and Trash) and positions. */
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
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: (tasks.data ?? []).map(({ user_id: _, updated_at: __, ...row }) => row),
    positions: positions.data ?? [],
  };
}

/** Loads a backup for the user. Ids are kept, so it fails if they already exist unless `replace` wipes first. */
export async function importAll(scope: Scope, backup: Backup, replace: boolean): Promise<{ tasks: number; positions: number }> {
  if (backup.version !== 1) throw new Error(`Unknown backup version ${String(backup.version)}`);
  for (const row of backup.tasks) {
    const issues = validateTask({
      title: row.title,
      status: row.status,
      startDate: row.start_date,
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
  return { tasks: backup.tasks.length, positions: backup.positions.length };
}

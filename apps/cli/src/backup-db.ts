import postgres from 'postgres';
import { validateTask } from '@app/core';
import { TASK_COLUMNS } from '@app/data';
import { upgradeBackup, type Backup, type BackupV1 } from './backup.ts';

/**
 * Backup and restore over a direct Postgres connection, for the nightly job and for disaster recovery.
 * Unlike the rest of the CLI these accept a hosted database URL, so they are deliberately narrow:
 * `exportFromDatabase` only reads, in a read-only transaction, and is meant for the `backup_reader`
 * role; `restoreToDatabase` writes one named user's tasks and positions, inside one transaction,
 * and refuses to touch a user who already has tasks unless told to replace them.
 */

/** Columns in the backup, in the order `exportAll` writes them: everything but the owner and the trigger-set timestamp. */
const COLUMNS = TASK_COLUMNS.split(',').filter((c) => c !== 'user_id' && c !== 'updated_at');

/**
 * Tables with user data that the backup does not carry yet. A table in neither list fails
 * `test-db/backup-roundtrip.test.ts`, so a new table can't be forgotten. Phase 2 moves the first
 * four into the backup (subtasks, tags, completions) and the tombstones with them.
 */
export const BACKED_UP_TABLES = ['tasks', 'task_positions'] as const;
export const NOT_BACKED_UP_YET = ['subtasks', 'tags', 'task_tags', 'task_completions', 'tombstones'] as const;

function one<T>(rows: T[]): T {
  if (rows.length !== 1) throw new Error(`Expected one row, got ${rows.length}.`);
  return rows[0]!;
}

function connect(url: string) {
  return postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 30, prepare: false });
}

export async function exportFromDatabase(url: string): Promise<Backup> {
  const sql = connect(url);
  try {
    return await sql.begin('read only', async (tx) => {
      const { owners } = one(await tx<{ owners: number }[]>`select count(distinct user_id)::int as owners from public.tasks`);
      if (owners > 1) throw new Error(`The database has tasks for ${owners} users; the backup format holds one user's data.`);
      const { tasks } = one(await tx<{ tasks: Backup['tasks'] }[]>`
        select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), '[]'::jsonb) as tasks
        from (select ${tx(COLUMNS)} from public.tasks) t`);
      const { positions } = one(await tx<{ positions: Backup['positions'] }[]>`
        select coalesce(jsonb_agg(to_jsonb(p) order by p.view_id, p.task_id), '[]'::jsonb) as positions
        from (select view_id, task_id, sort_key from public.task_positions) p`);
      return { version: 2 as const, exportedAt: new Date().toISOString(), tasks, positions };
    });
  } finally {
    await sql.end();
  }
}

export interface RestoreOptions {
  /** The auth user the data is restored for. They have to exist already. */
  userEmail: string;
  /** Delete that user's current tasks first. Without it a user who already has tasks is refused. */
  replace?: boolean;
}

export async function restoreToDatabase(url: string, loaded: Backup | BackupV1, options: RestoreOptions): Promise<{ tasks: number; positions: number }> {
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

  const sql = connect(url);
  try {
    return await sql.begin(async (tx) => {
      const users = await tx<{ id: string }[]>`select id from auth.users where lower(email) = lower(${options.userEmail})`;
      if (users.length !== 1) throw new Error(`Expected exactly one user with the email ${options.userEmail}, found ${users.length}. Create the user first.`);
      const userId = users[0]!.id;

      const { existing } = one(await tx<{ existing: number }[]>`select count(*)::int as existing from public.tasks where user_id = ${userId}`);
      if (existing > 0) {
        if (!options.replace) throw new Error(`${options.userEmail} already has ${existing} tasks. Pass --replace to delete them and restore the backup.`);
        await tx`delete from public.tasks where user_id = ${userId}`;
      }
      // Restored ids are alive again, so deleting the old copies must not leave tombstones that say otherwise.
      const ids = backup.tasks.map((t) => t.id);
      if (ids.length) await tx`delete from public.tombstones where entity = 'task' and id = any(${ids}::uuid[])`;

      // The column list is fixed above, never user input.
      await tx.unsafe(
        `insert into public.tasks (user_id, ${COLUMNS.join(', ')})
         select $1::uuid, ${COLUMNS.map((c) => `r.${c}`).join(', ')} from jsonb_populate_recordset(null::public.tasks, $2::text::jsonb) r`,
        [userId, JSON.stringify(backup.tasks)],
      );
      await tx.unsafe(
        `insert into public.task_positions (user_id, view_id, task_id, sort_key)
         select $1::uuid, r.view_id, r.task_id, r.sort_key from jsonb_populate_recordset(null::public.task_positions, $2::text::jsonb) r`,
        [userId, JSON.stringify(backup.positions)],
      );

      const { tasks, positions } = one(await tx<{ tasks: number; positions: number }[]>`
        select (select count(*) from public.tasks where user_id = ${userId})::int as tasks,
               (select count(*) from public.task_positions where user_id = ${userId})::int as positions`);
      if (tasks !== backup.tasks.length || positions !== backup.positions.length) {
        throw new Error(`Restore check failed: expected ${backup.tasks.length} tasks and ${backup.positions.length} positions, found ${tasks} and ${positions}. Nothing was changed.`);
      }
      return { tasks, positions };
    });
  } finally {
    await sql.end();
  }
}

/**
 * The backup and restore round trip against local Supabase: seed, export through the read-only
 * `backup_reader` role, wipe, restore, export again, compare. Run with `npm run test:db`.
 */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seed } from '../src/commands.ts';
import { exportAll, type Backup } from '../src/backup.ts';
import { BACKED_UP_TABLES, exportFromDatabase, NOT_BACKED_UP_YET, restoreToDatabase } from '../src/backup-db.ts';
import { connection, DEFAULT_SEED_FILE, DEV_USER } from '../src/config.ts';
import { adminClient, devUserId } from '../src/db.ts';
import { reset } from '../src/commands.ts';

const conn = connection();
const admin = adminClient();
const owner = postgres(conn.dbUrl, { max: 1, onnotice: () => {} });
const READER_PASSWORD = 'local-backup-reader-password';
const readerUrl = (() => {
  const url = new URL(conn.dbUrl);
  url.username = 'backup_reader';
  url.password = READER_PASSWORD;
  return url.toString();
})();

let userId: string;

/** The backup minus the time it was taken. */
const content = (backup: Backup) => ({ ...backup, exportedAt: undefined });

beforeAll(async () => {
  userId = await devUserId(admin);
  // The migration creates the role without a login; the project owner sets the password on the hosted project.
  await owner.unsafe(`alter role backup_reader with login password '${READER_PASSWORD}'`);
  await seed(admin, userId, { file: DEFAULT_SEED_FILE, today: '2026-11-18', reset: true });
});

afterAll(async () => {
  await owner.unsafe('alter role backup_reader with nologin');
  await owner.end();
});

describe('backup_reader', () => {
  it('reads the same backup the service key does', async () => {
    const viaApi = await exportAll({ db: admin, userId });
    const viaRole = await exportFromDatabase(readerUrl);
    expect(viaApi.tasks.length).toBeGreaterThan(40);
    expect(viaApi.positions.length).toBeGreaterThan(0);
    expect(content(viaRole)).toEqual(content(viaApi));
  });

  it('includes completed tasks and Trash', async () => {
    const backup = await exportFromDatabase(readerUrl);
    expect(backup.tasks.some((t) => t.completed_at)).toBe(true);
    expect(backup.tasks.some((t) => t.deleted_at)).toBe(true);
  });

  it('cannot write anything or read other schemas', async () => {
    const reader = postgres(readerUrl, { max: 1, onnotice: () => {} });
    try {
      await expect(reader`delete from public.tasks`).rejects.toThrow(/permission denied|read-only/);
      await expect(reader`update public.tasks set title = 'x'`).rejects.toThrow(/permission denied|read-only/);
      await expect(reader`insert into public.tags (user_id, name) values (${userId}, 'x')`).rejects.toThrow(/permission denied|read-only/);
      await expect(reader`select * from auth.users`).rejects.toThrow(/permission denied/);
      await expect(reader`create table public.nope (id int)`).rejects.toThrow(/permission denied|read-only/);
    } finally {
      await reader.end();
    }
  });

  it('refuses to export a database holding more than one user', async () => {
    const other = await admin.auth.admin.createUser({ email: 'second-owner@example.com', password: 'second-owner-pw', email_confirm: true });
    const otherId = other.data.user!.id;
    try {
      await owner`insert into public.tasks (user_id, title) values (${otherId}, 'someone else')`;
      await expect(exportFromDatabase(readerUrl)).rejects.toThrow(/2 users/);
    } finally {
      await admin.auth.admin.deleteUser(otherId);
    }
  });
});

describe('restore round trip', () => {
  it('restores a wiped database to exactly what was exported', async () => {
    const before = await exportFromDatabase(readerUrl);
    await reset(admin, userId);
    expect((await exportFromDatabase(readerUrl)).tasks).toHaveLength(0);

    const result = await restoreToDatabase(conn.dbUrl, before, { userEmail: DEV_USER.email });
    expect(result).toEqual({ tasks: before.tasks.length, positions: before.positions.length });

    const after = await exportFromDatabase(readerUrl);
    expect(content(after)).toEqual(content(before));
    // Restoring keeps every id, so the board's order and the Trash dates are intact.
    expect(await exportAll({ db: admin, userId })).toMatchObject({ tasks: before.tasks, positions: before.positions });
  });

  it('refuses to restore over existing tasks unless asked, and a failed restore changes nothing', async () => {
    const backup = await exportFromDatabase(readerUrl);
    await expect(restoreToDatabase(conn.dbUrl, backup, { userEmail: DEV_USER.email })).rejects.toThrow(/already has \d+ tasks/);

    const broken = { ...backup, positions: [...backup.positions, { view_id: 'main', task_id: '00000000-0000-4000-8000-00000000dead', sort_key: 'a' }] };
    await expect(restoreToDatabase(conn.dbUrl, broken, { userEmail: DEV_USER.email, replace: true })).rejects.toThrow();
    expect(content(await exportFromDatabase(readerUrl))).toEqual(content(backup));

    await expect(restoreToDatabase(conn.dbUrl, backup, { userEmail: 'nobody@example.com' })).rejects.toThrow(/Create the user first/);
    expect(await restoreToDatabase(conn.dbUrl, backup, { userEmail: DEV_USER.email, replace: true })).toEqual({
      tasks: backup.tasks.length,
      positions: backup.positions.length,
    });
    expect(content(await exportFromDatabase(readerUrl))).toEqual(content(backup));
  });

  it('refuses a backup that breaks the task rules', async () => {
    const backup = await exportFromDatabase(readerUrl);
    const bad = { ...backup, tasks: backup.tasks.map((t, i) => (i === 0 ? { ...t, title: '   ' } : t)) };
    await expect(restoreToDatabase(conn.dbUrl, bad, { userEmail: DEV_USER.email, replace: true })).rejects.toThrow(/Task /);
  });
});

describe('what the backup covers', () => {
  it('lists every table that holds user data, so a new table can not be forgotten', async () => {
    const rows = await owner<{ table_name: string }[]>`
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id'
      order by table_name`;
    const tables = rows.map((r) => r.table_name);
    expect(tables, 'Add the new table to the backup (apps/cli/src/backup-db.ts) and to the backup_reader grants and policies in a migration').toEqual(
      [...BACKED_UP_TABLES, ...NOT_BACKED_UP_YET].sort(),
    );
  });

  it('gives backup_reader a read policy on every one of them', async () => {
    const rows = await owner<{ tablename: string }[]>`
      select tablename from pg_policies where schemaname = 'public' and policyname = 'backup_reader_select' order by tablename`;
    expect(rows.map((r) => r.tablename)).toEqual([...BACKED_UP_TABLES, ...NOT_BACKED_UP_YET].sort());
  });
});

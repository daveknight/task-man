/**
 * Database checks against local Supabase: row-level security as real signed-in
 * users, and the sync-safety pieces of the schema. Run with `npm run test:db`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connection, DEV_USER } from '../src/config.ts';
import { adminClient, devUserId } from '../src/db.ts';

const OTHER_USER = { email: 'other-user@example.com', password: 'other-password' };
const TABLES = ['tasks', 'task_positions', 'subtasks', 'tags', 'task_tags', 'task_completions', 'tombstones'];

const conn = connection();
const admin = adminClient();
const sql = postgres(conn.dbUrl, { max: 1, onnotice: () => {} });

let devId: string;
let otherId: string;
let dev: SupabaseClient;
let other: SupabaseClient;
const created: string[] = [];

async function signedIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(conn.url, conn.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function ensureUser(email: string, password: string): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = data.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const res = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (res.error) throw res.error;
  return res.data.user.id;
}

async function addTask(client: SupabaseClient, fields: Record<string, unknown> = {}) {
  const res = await client.from('tasks').insert({ title: 'RLS test task', ...fields }).select().single();
  if (res.data) created.push(res.data.id);
  return res;
}

beforeAll(async () => {
  devId = await devUserId(admin);
  otherId = await ensureUser(OTHER_USER.email, OTHER_USER.password);
  dev = await signedIn(DEV_USER.email, DEV_USER.password);
  other = await signedIn(OTHER_USER.email, OTHER_USER.password);
});

afterAll(async () => {
  if (created.length > 0) {
    await admin.from('tasks').delete().in('id', created);
    await admin.from('tombstones').delete().in('id', created);
  }
  await admin.from('tombstones').delete().eq('user_id', otherId);
  await sql.end();
});

describe('schema shape', () => {
  it('has row-level security on every public table', async () => {
    const rows = await sql<{ tablename: string; rowsecurity: boolean }[]>`
      select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`;
    expect(rows.map((r) => r.tablename).sort()).toEqual([...TABLES].sort());
    expect(rows.filter((r) => !r.rowsecurity)).toEqual([]);
  });

  it('defaults user_id to auth.uid() on every table', async () => {
    const rows = await sql<{ table_name: string; column_default: string | null }[]>`
      select table_name, column_default from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id'`;
    expect(rows.map((r) => r.table_name).sort()).toEqual([...TABLES].sort());
    for (const row of rows) expect(row.column_default).toBe('auth.uid()');
  });

  it('stores sort keys with byte-wise ("C") collation', async () => {
    const rows = await sql<{ table_name: string; collation_name: string }[]>`
      select table_name, collation_name from information_schema.columns
      where table_schema = 'public' and column_name = 'sort_key'`;
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.collation_name).toBe('C');
  });
});

describe('row-level security', () => {
  it('shows nothing to a signed-out client', async () => {
    await addTask(dev);
    const anon = createClient(conn.url, conn.anonKey, { auth: { persistSession: false } });
    const { data } = await anon.from('tasks').select('id');
    expect(data ?? []).toEqual([]);
    const insert = await anon.from('tasks').insert({ title: 'anon' });
    expect(insert.error).not.toBeNull();
  });

  it('fills user_id from the signed-in user', async () => {
    const { data, error } = await addTask(dev);
    expect(error).toBeNull();
    expect(data!.user_id).toBe(devId);
  });

  it("keeps one user's tasks invisible and untouchable to another", async () => {
    const { data: task } = await addTask(dev, { title: 'Private to dev' });
    const seen = await other.from('tasks').select('id').eq('id', task!.id);
    expect(seen.data).toEqual([]);
    const updated = await other.from('tasks').update({ title: 'hacked' }).eq('id', task!.id).select();
    expect(updated.data).toEqual([]);
    const deleted = await other.from('tasks').delete().eq('id', task!.id).select();
    expect(deleted.data).toEqual([]);
    const forged = await other.from('tasks').insert({ title: 'forged', user_id: devId });
    expect(forged.error).not.toBeNull();
    const stillThere = await dev.from('tasks').select('title').eq('id', task!.id).single();
    expect(stillThere.data!.title).toBe('Private to dev');
  });

  it("won't let a user attach rows to another user's task", async () => {
    const { data: task } = await addTask(dev);
    const position = await other.from('task_positions').insert({ view_id: 'main', task_id: task!.id, sort_key: 'a0' });
    expect(position.error).not.toBeNull();
    const subtask = await other.from('subtasks').insert({ task_id: task!.id, title: 'x', sort_key: 'a0' });
    expect(subtask.error).not.toBeNull();
  });
});

describe('sync safety', () => {
  it('sets updated_at from the database clock, ignoring the client', async () => {
    const { data: task } = await addTask(dev, { updated_at: '2000-01-01T00:00:00Z' });
    expect(new Date(task!.updated_at).getFullYear()).toBeGreaterThan(2000);
    const before = task!.updated_at as string;
    await new Promise((r) => setTimeout(r, 20));
    const { data: after } = await dev
      .from('tasks')
      .update({ title: 'Edited', updated_at: '2000-01-01T00:00:00Z' })
      .eq('id', task!.id)
      .select()
      .single();
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it('rejects a start date after the due date', async () => {
    const { error } = await addTask(dev, { start_date: '2026-11-21', due_date: '2026-11-20' });
    expect(error?.message).toMatch(/tasks_start_on_or_before_due/);
  });

  it('allows a Waiting task hide-until date after its due date', async () => {
    const { error } = await addTask(dev, { status: 'waiting', hide_until: '2026-11-21', due_date: '2026-11-20' });
    expect(error).toBeNull();
  });

  it.each(['waiting', 'in_progress'])('rejects a start date on a %s task', async (status) => {
    const { error } = await addTask(dev, { status, start_date: '2026-11-21' });
    expect(error?.message).toMatch(/tasks_start_only_when_open/);
  });

  it.each(['open', 'in_progress'])('rejects hide_until on a %s task', async (status) => {
    const { error } = await addTask(dev, { status, hide_until: '2026-11-21' });
    expect(error?.message).toMatch(/tasks_hide_until_only_when_waiting/);
  });

  it('allows a start date on an Open task, and moving a task to Waiting clears it in the same update', async () => {
    const { data, error } = await addTask(dev, { status: 'open', start_date: '2026-11-25', due_date: '2026-12-01' });
    expect(error).toBeNull();
    const moved = await dev.from('tasks').update({ status: 'waiting', start_date: null, hide_until: '2026-12-10' }).eq('id', data!.id);
    expect(moved.error).toBeNull();
    const bad = await dev.from('tasks').update({ status: 'open' }).eq('id', data!.id);
    expect(bad.error?.message).toMatch(/tasks_hide_until_only_when_waiting/);
  });

  it('records each occurrence completion only once', async () => {
    const { data: task } = await addTask(dev, { due_date: '2026-11-20' });
    const row = { task_id: task!.id, occurrence_due: '2026-11-20', kind: 'done', completed_on: '2026-11-20' };
    expect((await dev.from('task_completions').insert(row)).error).toBeNull();
    const again = await dev.from('task_completions').insert(row);
    expect(again.error?.code).toBe('23505');
  });

  it('leaves a tombstone when a task is deleted forever, which clients cannot remove', async () => {
    const { data: task } = await addTask(other);
    await other.from('tasks').delete().eq('id', task!.id);
    const tomb = await other.from('tombstones').select('id,entity').eq('id', task!.id);
    expect(tomb.data).toEqual([{ id: task!.id, entity: 'task' }]);
    await other.from('tombstones').delete().eq('id', task!.id);
    const still = await other.from('tombstones').select('id').eq('id', task!.id);
    expect(still.data).toHaveLength(1);
  });

  it('orders sort keys byte-wise in the database, matching core', async () => {
    const { data: task } = await addTask(dev);
    const keys = await sql<{ k: string }[]>`
      select k from unnest(array['a0', 'Zz', 'a0V', 'B', 'b']::text[]) as k order by k collate "C"`;
    expect(keys.map((r) => r.k)).toEqual(['B', 'Zz', 'a0', 'a0V', 'b']);
    const pos = await dev.from('task_positions').insert({ view_id: 'test', task_id: task!.id, sort_key: 'Zz' }).select().single();
    expect(pos.data!.user_id).toBe(devId);
  });
});

/**
 * The search and Trash purge functions against local Supabase: search runs as the signed-in user
 * (row-level security applies) and never returns Trash; purge removes tasks deleted over 30 days ago.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connection, DEV_USER } from '../src/config.ts';
import { adminClient, devUserId } from '../src/db.ts';

const OTHER_USER = { email: 'other-user@example.com', password: 'other-password' };
const MARK = `zq${Date.now().toString(36)}`;

const conn = connection();
const admin = adminClient();
const sql = postgres(conn.dbUrl, { max: 1, onnotice: () => {} });

let devId: string;
let otherId: string;
let dev: SupabaseClient;
let other: SupabaseClient;

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

async function add(userId: string, title: string, fields: Record<string, unknown> = {}): Promise<string> {
  const res = await admin
    .from('tasks')
    .insert({ user_id: userId, title: `${MARK} ${title}`, ...fields })
    .select('id')
    .single();
  if (res.error) throw res.error;
  return res.data.id as string;
}

async function search(client: SupabaseClient, query: string, options: { completed?: boolean; flagged?: boolean } = {}): Promise<string[]> {
  const { data, error } = await client.rpc('search_tasks', { query, include_completed: options.completed ?? false, flagged_only: options.flagged ?? false });
  if (error) throw error;
  return (data as { title: string }[])
    .filter((t) => t.title.startsWith(MARK))
    .map((t) => t.title.replace(`${MARK} `, ''))
    .sort();
}

beforeAll(async () => {
  devId = await devUserId(admin);
  otherId = await ensureUser(OTHER_USER.email, OTHER_USER.password);
  dev = await signedIn(DEV_USER.email, DEV_USER.password);
  other = await signedIn(OTHER_USER.email, OTHER_USER.password);
  await add(devId, 'open plain');
  await add(devId, 'open flagged', { flagged: true });
  await add(devId, 'done', { completed_at: '2026-11-10T12:00:00Z', completed_on: '2026-11-10' });
  await add(devId, 'trashed', { deleted_at: '2026-11-10T12:00:00Z', deleted_on: '2026-11-10' });
  await add(devId, 'percent 100% literal');
  await add(otherId, 'someone else');
});

afterAll(async () => {
  for (const userId of [devId, otherId]) {
    const { data } = await admin.from('tasks').select('id').eq('user_id', userId).like('title', `${MARK}%`);
    const ids = (data ?? []).map((r) => r.id as string);
    if (ids.length) {
      await admin.from('tasks').delete().in('id', ids);
      await admin.from('tombstones').delete().in('id', ids);
    }
  }
  await sql.end();
});

describe('search_tasks', () => {
  it("finds the signed-in user's open tasks, never Trash or another user's", async () => {
    expect(await search(dev, MARK)).toEqual(['open flagged', 'open plain', 'percent 100% literal']);
    expect(await search(other, MARK)).toEqual(['someone else']);
  });

  it('includes completed tasks on request', async () => {
    expect(await search(dev, MARK, { completed: true })).toEqual(['done', 'open flagged', 'open plain', 'percent 100% literal']);
  });

  it('filters to flagged', async () => {
    expect(await search(dev, MARK, { flagged: true })).toEqual(['open flagged']);
  });

  it('treats % and _ as literal characters', async () => {
    expect(await search(dev, '0% l')).toEqual(['percent 100% literal']);
    expect(await search(dev, '0_ l')).toEqual([]);
  });

  it('returns nothing to a signed-out client', async () => {
    const anon = createClient(conn.url, conn.anonKey, { auth: { persistSession: false } });
    const { data } = await anon.rpc('search_tasks', { query: MARK, include_completed: true, flagged_only: false });
    expect(data ?? []).toEqual([]);
  });
});

describe('purge_trash', () => {
  it("can't be called by signed-in users", async () => {
    const { error } = await dev.rpc('purge_trash', { today: '2026-12-31' });
    expect(error).not.toBeNull();
  });

  it('removes tasks deleted more than 30 days ago, and only those', async () => {
    const old = await add(devId, 'deleted long ago', { deleted_at: '2026-10-01T12:00:00Z', deleted_on: '2026-10-01' });
    const edge = await add(devId, 'deleted exactly 30 days ago', { deleted_at: '2026-10-19T12:00:00Z', deleted_on: '2026-10-19' });
    const purged = await sql<{ purge_trash: string }[]>`select public.purge_trash(${'2026-11-18'}::date, ${devId}::uuid)`;
    const ids = purged.map((r) => r.purge_trash);
    expect(ids).toContain(old);
    expect(ids).not.toContain(edge);
    const { data } = await admin.from('tasks').select('id').in('id', [old, edge]);
    expect((data ?? []).map((r) => r.id)).toEqual([edge]);
    const { data: tombstones } = await admin.from('tombstones').select('id').eq('id', old);
    expect(tombstones).toHaveLength(1);
  });

  it('is scheduled daily with pg_cron', async () => {
    const jobs = await sql<{ jobname: string; schedule: string }[]>`select jobname, schedule from cron.job where jobname = 'purge-trash'`;
    expect(jobs).toEqual([{ jobname: 'purge-trash', schedule: '17 4 * * *' }]);
  });
});

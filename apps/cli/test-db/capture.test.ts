/**
 * `capture --apply` against local Supabase. Replays use the recorded examples and do not call a provider.
 * The rows this creates are removed afterwards, including the open "Pick up dry cleaning" (a completed
 * one with that title is already in the seed).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { connection } from '../src/config.ts';
import { adminClient, devUserId } from '../src/db.ts';

const conn = connection();
const admin = adminClient();
const root = fileURLToPath(new URL('../../..', import.meta.url));
const tsx = fileURLToPath(new URL('../../../node_modules/.bin/tsx', import.meta.url));
const created: string[] = [];

function cli(...args: string[]): string {
  return execFileSync(tsx, ['apps/cli/src/main.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_URL: conn.url,
      SUPABASE_SERVICE_ROLE_KEY: conn.serviceKey,
      SUPABASE_ANON_KEY: conn.anonKey,
      SUPABASE_DB_URL: conn.dbUrl,
    },
  });
}

afterAll(async () => {
  if (created.length === 0) return;
  await admin.from('tasks').delete().in('id', created);
  await admin.from('tombstones').delete().in('id', created);
});

describe('capture --apply', () => {
  it('writes a create and writes nothing for a low-confidence update', async () => {
    const userId = await devUserId(admin);
    const count = async () => {
      const { data, error } = await admin.from('tasks').select('id').eq('user_id', userId);
      if (error) throw new Error(error.message);
      return data.length;
    };
    const before = await count();
    const low = JSON.parse(cli('capture', '--example', 'follow-up-dan', '--apply', '--json', '--today', '2026-11-18'));
    expect(low.confidence).toBe('low');
    expect(low.applied).toBe(false);
    expect(await count()).toBe(before);

    const high = JSON.parse(cli('capture', '--example', 'dry-cleaning', '--apply', '--json', '--today', '2026-11-18'));
    expect(high.applied).toBe(true);
    expect(high.saved[0].title).toBe('Pick up dry cleaning');
    created.push(high.saved[0].id);
    const row = await admin.from('tasks').select('due_date, status, completed_at').eq('id', high.saved[0].id).single();
    expect(row.data).toMatchObject({ due_date: '2026-11-20', status: 'open', completed_at: null });

    const weekly = JSON.parse(cli('capture', '--example', 'garbage-weekly', '--apply', '--json', '--today', '2026-11-18'));
    created.push(weekly.saved[0].id);
    const garbage = await admin.from('tasks').select('title, due_date, repeat').eq('id', weekly.saved[0].id).single();
    expect(garbage.data).toMatchObject({
      title: 'Take out the garbage',
      due_date: '2026-11-18',
      repeat: { mode: 'schedule', freq: 'weekly', interval: 1, byWeekday: ['wed'] },
    });
  });
});

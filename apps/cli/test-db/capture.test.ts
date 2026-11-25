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
  it('writes a create, updates a matching task, appends a note, and does not guess', async () => {
    const userId = await devUserId(admin);
    const count = async () => {
      const { data, error } = await admin.from('tasks').select('id').eq('user_id', userId);
      if (error) throw new Error(error.message);
      return data.length;
    };
    const before = await count();
    const missing = JSON.parse(cli('capture', '--example', 'follow-up-dan', '--apply', '--json', '--today', '2026-11-18'));
    expect(missing.message).toBe('No task was found.');
    expect(missing.applied).toBe(false);
    expect(await count()).toBe(before);

    const high = JSON.parse(cli('capture', '--example', 'dry-cleaning', '--apply', '--json', '--today', '2026-11-18'));
    expect(high.applied).toBe(true);
    expect(high.saved[0].title).toBe('Pick up dry cleaning');
    created.push(high.saved[0].id);
    const row = await admin.from('tasks').select('due_date, status, completed_at').eq('id', high.saved[0].id).single();
    expect(row.data).toMatchObject({ due_date: '2026-11-20', status: 'open', completed_at: null });

    const close = JSON.parse(cli('add', 'Take out garbage', '--json', '--today', '2026-11-18'));
    created.push(close.task.id);
    const weekly = JSON.parse(cli('capture', '--example', 'garbage-weekly', '--apply', '--json', '--today', '2026-11-18'));
    expect(weekly.applied).toBe(false);
    expect(weekly.cards[0].ask).toBe('Update its repeat, or create another?');
    expect(await count()).toBe(before + 2);
    const original = await admin.from('tasks').select('repeat').eq('id', close.task.id).single();
    expect(original.data?.repeat ?? null).toBeNull();

    const added = JSON.parse(cli('add', 'Follow up with Dan', '--json', '--today', '2026-11-18'));
    created.push(added.task.id);
    const updated = JSON.parse(cli('capture', '--example', 'follow-up-dan', '--apply', '--json', '--today', '2026-11-18'));
    expect(updated.applied).toBe(true);
    expect(updated.saved[0].id).toBe(added.task.id);
    const dan = await admin.from('tasks').select('title, start_date').eq('id', added.task.id).single();
    expect(dan.data).toMatchObject({ title: 'Follow up with Dan', start_date: '2026-11-23' });
    expect(await count()).toBe(before + 3);

    const jeans = JSON.parse(cli('add', 'Buy jeans', '--desc', 'Dark wash', '--json', '--today', '2026-11-18'));
    created.push(jeans.task.id);
    const noted = JSON.parse(cli('capture', '--example', 'jeans-note', '--apply', '--json', '--today', '2026-11-18'));
    expect(noted.applied).toBe(true);
    expect(noted.saved[0].id).toBe(jeans.task.id);
    const jeansRow = await admin.from('tasks').select('description').eq('id', jeans.task.id).single();
    expect(jeansRow.data?.description).toBe('Dark wash\ncheck out 501 33/33 size');
  });
});

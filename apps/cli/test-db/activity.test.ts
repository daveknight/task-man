/**
 * Field-change triggers against local Supabase. An update, a status change, a subtask
 * check and a completion each write a row. A reorder does not. An occurrence's own
 * follow-up write is not a second copy of the completion.
 */
import { isOccurrenceHistory } from '@app/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connection, DEV_USER } from '../src/config.ts';
import { adminClient, devUserId } from '../src/db.ts';
import { addTask, doneTask, historyTask, moveTask, type Context } from '../src/tasks.ts';

const conn = connection();
const admin = adminClient();
let dev: SupabaseClient;
let ctx: Context;
const created: string[] = [];

async function signedIn(): Promise<SupabaseClient> {
  const client = createClient(conn.url, conn.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: DEV_USER.email, password: DEV_USER.password });
  if (error) throw error;
  return client;
}

beforeAll(async () => {
  dev = await signedIn();
  ctx = { scope: { db: admin, userId: await devUserId(admin) }, today: '2026-11-18', now: '2026-11-18T19:00:00.000Z' };
});

afterAll(async () => {
  if (created.length > 0) {
    await admin.from('tasks').delete().in('id', created);
    await admin.from('tombstones').delete().in('id', created);
  }
});

interface ActivityRow {
  kind: string;
  field: string;
  before: unknown;
  after: unknown;
  batch_id: string;
  seq: number;
}

async function rows(taskId: string): Promise<ActivityRow[]> {
  const { data, error } = await dev.from('task_activities').select('kind,field,before,after,batch_id,seq').eq('task_id', taskId).order('at').order('seq');
  if (error) throw error;
  return data ?? [];
}

describe('task activity triggers', () => {
  it('records a create, a multi-field update, a status change, a subtask check and a completion, and ignores a reorder', async () => {
    const inserted = await dev.from('tasks').insert({ title: 'History task', due_date: '2026-11-18' }).select('id').single();
    if (inserted.error) throw inserted.error;
    const taskId = inserted.data.id as string;
    created.push(taskId);

    expect(await rows(taskId)).toEqual([
      expect.objectContaining({ kind: 'created', field: 'title', before: null, after: 'History task' }),
    ]);

    const edited = await dev.from('tasks').update({ title: 'History task renamed', due_date: '2026-11-20' }).eq('id', taskId).select('id');
    expect(edited.error).toBeNull();
    const afterEdit = await rows(taskId);
    const changed = afterEdit.filter((row) => row.kind === 'changed');
    expect(changed.map((row) => row.field).sort()).toEqual(['dueDate', 'title']);
    expect(new Set(changed.map((row) => row.batch_id)).size).toBe(1);
    expect(changed.find((row) => row.field === 'title')).toMatchObject({ before: 'History task', after: 'History task renamed' });
    expect(changed.find((row) => row.field === 'dueDate')).toMatchObject({ before: '2026-11-18', after: '2026-11-20' });

    const same = afterEdit.length;
    const untouched = await dev.from('tasks').update({ title: 'History task renamed' }).eq('id', taskId);
    expect(untouched.error).toBeNull();
    expect(await rows(taskId)).toHaveLength(same);

    const moved = await dev.from('tasks').update({ status: 'in_progress' }).eq('id', taskId);
    expect(moved.error).toBeNull();
    const status = (await rows(taskId)).find((row) => row.field === 'status');
    expect(status?.before).toMatchObject({ status: 'open' });
    expect(status?.after).toMatchObject({ status: 'in_progress' });

    const sub = await dev.from('subtasks').insert({ task_id: taskId, title: 'Pack the bag', sort_key: 'a0' }).select('id').single();
    if (sub.error) throw sub.error;
    const checked = await dev.from('subtasks').update({ done: true }).eq('id', sub.data.id);
    expect(checked.error).toBeNull();
    const subtask = (await rows(taskId)).filter((row) => row.field === 'subtask');
    expect(subtask.map((row) => row.after)).toEqual([
      expect.objectContaining({ title: 'Pack the bag', done: false }),
      expect.objectContaining({ title: 'Pack the bag', done: true }),
    ]);

    const beforeSort = (await rows(taskId)).length;
    const reordered = await dev.from('subtasks').update({ sort_key: 'b0' }).eq('id', sub.data.id);
    expect(reordered.error).toBeNull();
    expect(await rows(taskId)).toHaveLength(beforeSort);
    const beforePosition = beforeSort;
    const position = await dev.from('task_positions').insert({ view_id: 'main', task_id: taskId, sort_key: 'a0' });
    expect(position.error).toBeNull();
    const shifted = await dev.from('task_positions').update({ sort_key: 'a1' }).eq('task_id', taskId).eq('view_id', 'main');
    expect(shifted.error).toBeNull();
    expect(await rows(taskId)).toHaveLength(beforePosition);

    const done = await dev.from('tasks').update({ completed_at: '2026-11-18T19:00:00.000Z', completed_on: '2026-11-18' }).eq('id', taskId);
    expect(done.error).toBeNull();
    const completed = (await rows(taskId)).find((row) => row.field === 'completed');
    expect(completed?.before).toMatchObject({ completedAt: null });
    expect(completed?.after).toMatchObject({ completedAt: expect.any(String), completedOn: '2026-11-18' });

    const forged = await dev.from('task_activities').insert({ task_id: taskId, batch_id: taskId, kind: 'changed', field: 'title', after: 'nope' });
    expect(forged.error).not.toBeNull();
  });

  it('keeps an occurrence in task_completions and does not also record the due date it moved', async () => {
    const added = await addTask(ctx, `act${Date.now().toString(36)} weekly`, { due: '2026-11-18', repeat: { repeat: 'weekly' } });
    created.push(added.task.id);
    await doneTask(ctx, added.task.id);
    const history = await historyTask(ctx, added.task.id);
    expect(history.filter(isOccurrenceHistory).map((row) => row.kind)).toEqual(['done']);
    expect(history.some((row) => !isOccurrenceHistory(row) && row.field === 'dueDate')).toBe(false);
    expect(history.some((row) => !isOccurrenceHistory(row) && row.field === 'completed')).toBe(false);

    const plain = await addTask(ctx, `act${Date.now().toString(36)} once`, { due: '2026-11-18' });
    created.push(plain.task.id);
    const beforeMove = (await historyTask(ctx, plain.task.id)).length;
    await moveTask(ctx, plain.task.id, { top: true });
    expect(await historyTask(ctx, plain.task.id)).toHaveLength(beforeMove);
    await doneTask(ctx, plain.task.id);
    const once = await historyTask(ctx, plain.task.id);
    expect(once.filter(isOccurrenceHistory)).toEqual([]);
    expect(once.filter((row) => !isOccurrenceHistory(row) && row.field === 'completed')).toHaveLength(1);
  });
});

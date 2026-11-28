/**
 * Tool calls against local Supabase, as the dev user. The server is given only the
 * public URL and anon key. Cleanup uses the service role the same way the other
 * database tests do; the server under test never sees that key.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { drainFileDeletions } from '@app/data';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connection, DEV_USER } from '../../cli/src/config.ts';
import { adminClient, devUserId } from '../../cli/src/db.ts';
import { listen, type ListeningServer } from '../src/listen.ts';

const conn = connection();
process.env.SUPABASE_URL = conn.url;
process.env.SUPABASE_ANON_KEY = conn.anonKey;

let server: ListeningServer;
let token: string;
let user: SupabaseClient;
let userId: string;
const created: string[] = [];
const uploaded: string[] = [];

beforeAll(async () => {
  server = await listen({ host: '127.0.0.1', port: 0 });
  user = createClient(conn.url, conn.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await user.auth.signInWithPassword({ email: DEV_USER.email, password: DEV_USER.password });
  if (signed.error || !signed.data.session) throw signed.error ?? new Error('Dev user sign-in failed');
  token = signed.data.session.access_token;
  userId = await devUserId(adminClient());
});

afterAll(async () => {
  const admin = adminClient();
  if (created.length > 0) {
    await admin.from('tasks').delete().in('id', created);
    await admin.from('tombstones').delete().in('id', created);
  }
  await drainFileDeletions({ db: admin, userId });
  if (uploaded.length > 0) await admin.from('tombstones').delete().in('id', uploaded);
  await server.close();
});

function textOf(result: { content: readonly { type: string; text?: string }[] }): string {
  return result.content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
}

async function call(name: string, args: Record<string, unknown>, accessToken: string | undefined = token) {
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: accessToken ? { headers: { authorization: `Bearer ${accessToken}` } } : undefined,
  });
  const client = new Client({ name: 'task-mcp-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = textOf(result);
    if (result.isError) throw new Error(text);
    return JSON.parse(text) as Record<string, unknown>;
  } finally {
    await client.close();
  }
}

async function failCall(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    await call(name, args);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`${name} was expected to fail`);
}

interface ActivityRow {
  kind: string;
  field: string;
  before: unknown;
  after: unknown;
  seq: number;
}

async function activities(taskId: string): Promise<ActivityRow[]> {
  const { data, error } = await user.from('task_activities').select('kind,field,before,after,seq').eq('task_id', taskId).order('at').order('seq');
  if (error) throw error;
  return data ?? [];
}

describe('task MCP server', () => {
  it('creates a task, records a field change in history, and completes it', async () => {
    const title = `MCP ${crypto.randomUUID()}`;
    const createdTask = await call('create_task', { title });
    const task = createdTask.task as { id: string; title: string; completedAt?: string | null };
    created.push(task.id);
    expect(task.title).toBe(title);
    expect(task.completedAt ?? null).toBeNull();

    const renamed = `${title} renamed`;
    const updated = await call('update_task', { task: task.id, title: renamed });
    expect((updated.task as { title: string }).title).toBe(renamed);

    const history = (await call('history', { task: task.id })) as unknown as { action: string; field?: string; before: unknown; after: unknown }[];
    expect(history).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'changed', field: 'title', before: title, after: renamed })]));

    const done = await call('complete_task', { task: task.id });
    expect((done.task as { completedAt?: string | null }).completedAt).toEqual(expect.any(String));
  });

  it('rejects a call with no token', async () => {
    const response = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { message?: string };
    expect(body.message).toMatch(/access token/i);
  });

  it('rejects a service-role key', async () => {
    const response = await fetch(server.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${conn.serviceKey}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { message?: string };
    expect(body.message).toMatch(/service-role/i);
  });

  it('uploads and downloads file bytes, and only the upload writes a file history row', async () => {
    const title = `MCP file ${crypto.randomUUID()}`;
    const createdTask = await call('create_task', { title });
    const taskId = (createdTask.task as { id: string }).id;
    created.push(taskId);
    const bytes = Uint8Array.from([0, 255, 10, 13, 0x80, 32]);
    const data = Buffer.from(bytes).toString('base64');

    const uploadedFile = await call('upload_attachment', { task: taskId, name: 'dir/notes.bin', type: 'application/octet-stream', data });
    const file = uploadedFile.file as { id: string; name: string; type: string; size: number };
    uploaded.push(file.id);
    expect(file.name).toBe('notes.bin');
    expect(file.type).toBe('application/octet-stream');
    expect(file.size).toBe(bytes.byteLength);

    const stored = await user.from('attachments').select('user_id,storage_path,bytes').eq('id', file.id).single();
    expect(stored.error).toBeNull();
    expect(stored.data!.user_id).toBe(userId);
    expect(stored.data!.storage_path).toBe(`${userId}/${taskId}/${file.id}`);
    expect(Number(stored.data!.bytes)).toBe(bytes.byteLength);

    const listed = await call('list_attachments', { task: taskId });
    expect(listed.files).toEqual([{ id: file.id, name: 'notes.bin', type: 'application/octet-stream', size: bytes.byteLength }]);

    const beforeDownload = await activities(taskId);
    expect(beforeDownload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'changed', field: 'file', seq: 1, before: null, after: { id: file.id, filename: 'notes.bin' } }),
      ]),
    );

    const downloaded = await call('download_attachment', { task: taskId, file: 'notes.bin' });
    expect(Buffer.from(downloaded.data as string, 'base64')).toEqual(Buffer.from(bytes));
    expect(downloaded.file).toEqual({ id: file.id, name: 'notes.bin', type: 'application/octet-stream', size: bytes.byteLength });
    expect(await activities(taskId)).toEqual(beforeDownload);

    const again = await call('upload_attachment', { task: taskId, name: 'notes.bin', data });
    const second = again.file as { id: string };
    uploaded.push(second.id);
    expect(await failCall('download_attachment', { task: taskId, file: 'notes.bin' })).toMatch(new RegExp(file.id));
    const byId = await call('download_attachment', { task: taskId, file: second.id });
    expect((byId.file as { id: string }).id).toBe(second.id);

    expect(await failCall('upload_attachment', { task: taskId, name: 'empty.txt', data: '' })).toMatch(/empty/i);
    expect(await failCall('upload_attachment', { task: taskId, name: 'bad.txt', data: 'not base64' })).toMatch(/base64/);
  });

  it('moves a task to Recently deleted without completing it or removing the row', async () => {
    const title = `MCP delete ${crypto.randomUUID()}`;
    const createdTask = await call('create_task', { title });
    const taskId = (createdTask.task as { id: string }).id;
    created.push(taskId);
    const uploadedFile = await call('upload_attachment', {
      task: taskId,
      name: 'keep.txt',
      type: 'text/plain',
      data: Buffer.from('still here').toString('base64'),
    });
    const fileId = (uploadedFile.file as { id: string }).id;
    uploaded.push(fileId);

    const deleted = await call('delete_task', { task: taskId });
    const task = deleted.task as { id: string; deletedAt?: string | null; completedAt?: string | null; status?: string };
    expect(deleted.placement).toBe('trash');
    expect(task.id).toBe(taskId);
    expect(task.deletedAt).toEqual(expect.any(String));
    expect(task.completedAt ?? null).toBeNull();
    expect(task.status).toBe('open');

    const row = await user.from('tasks').select('deleted_at,deleted_on,completed_at').eq('id', taskId).single();
    expect(row.error).toBeNull();
    expect(row.data!.deleted_at).toEqual(expect.any(String));
    expect(row.data!.deleted_on).toEqual(expect.any(String));
    expect(row.data!.completed_at).toBeNull();
    expect((await user.from('task_completions').select('id').eq('task_id', taskId)).data ?? []).toEqual([]);

    const history = await activities(taskId);
    const removed = history.find((entry) => entry.field === 'deleted');
    expect(removed).toMatchObject({ kind: 'changed', seq: 1 });
    expect(removed?.before).toMatchObject({ deletedAt: null, completedAt: null, status: 'open' });
    expect(removed?.after).toMatchObject({ completedAt: null, status: 'open' });
    expect((removed?.after as { deletedAt?: unknown }).deletedAt).toEqual(expect.any(String));
    expect(history.some((entry) => entry.field === 'completed')).toBe(false);
    expect(history.filter((entry) => entry.field === 'file').map((entry) => entry.after)).toEqual([{ id: fileId, filename: 'keep.txt' }]);

    const downloaded = await call('download_attachment', { task: taskId, file: 'keep.txt' });
    expect(Buffer.from(downloaded.data as string, 'base64').toString('utf8')).toBe('still here');

    const shown = (await call('history', { task: taskId })) as unknown as { action: string; field?: string; verb?: string }[];
    expect(shown).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'changed', field: 'deleted', verb: 'deleted the task' })]));
    expect(shown.some((entry) => entry.action === 'completed' || entry.field === 'completed')).toBe(false);

    const board = (await call('board', {})) as { sections: { tasks: { id: string }[]; later?: { id: string }[] }[] };
    const visible = board.sections.flatMap((section) => [...section.tasks, ...(section.later ?? [])].map((item) => item.id));
    expect(visible).not.toContain(taskId);
    const found = (await call('search', { query: title })) as unknown as { task: { id: string } }[];
    expect(found.map((item) => item.task.id)).not.toContain(taskId);

    expect(await failCall('delete_task', { task: taskId })).toMatch(/Recently deleted/);
    expect(await failCall('upload_attachment', { task: taskId, name: 'late.txt', data: Buffer.from('x').toString('base64') })).toMatch(/Recently deleted/);

    const still = await user.from('tasks').select('id,completed_at').eq('id', taskId).single();
    expect(still.data!.id).toBe(taskId);
    expect(still.data!.completed_at).toBeNull();
  });
});

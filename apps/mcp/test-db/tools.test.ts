/**
 * Tool calls against local Supabase, as the dev user. The server is given only the
 * public URL and anon key. Cleanup uses the service role the same way the other
 * database tests do; the server under test never sees that key.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connection, DEV_USER } from '../../cli/src/config.ts';
import { adminClient } from '../../cli/src/db.ts';
import { listen, type ListeningServer } from '../src/listen.ts';

const conn = connection();
process.env.SUPABASE_URL = conn.url;
process.env.SUPABASE_ANON_KEY = conn.anonKey;

let server: ListeningServer;
let token: string;
const created: string[] = [];

beforeAll(async () => {
  server = await listen({ host: '127.0.0.1', port: 0 });
  const auth = createClient(conn.url, conn.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await auth.auth.signInWithPassword({ email: DEV_USER.email, password: DEV_USER.password });
  if (signed.error || !signed.data.session) throw signed.error ?? new Error('Dev user sign-in failed');
  token = signed.data.session.access_token;
});

afterAll(async () => {
  const admin = adminClient();
  if (created.length > 0) {
    await admin.from('tasks').delete().in('id', created);
    await admin.from('tombstones').delete().in('id', created);
  }
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
});

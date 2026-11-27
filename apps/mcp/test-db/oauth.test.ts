/**
 * Browser sign-in against local Supabase. The server is given only the public URL
 * and anon key. Cleanup uses the service role the same way the other database tests
 * do; the server under test never sees that key.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connection, DEV_USER } from '../../cli/src/config.ts';
import { adminClient } from '../../cli/src/db.ts';
import { listen, type ListeningServer } from '../src/listen.ts';
import { newVerifier, s256Challenge } from '../src/oauth/pkce.ts';
import { setOauthCodeTtlSeconds } from '../src/oauth/store.ts';

const conn = connection();
process.env.SUPABASE_URL = conn.url;
process.env.SUPABASE_ANON_KEY = conn.anonKey;

let server: ListeningServer;
const created: string[] = [];

beforeAll(async () => {
  server = await listen({ host: '127.0.0.1', port: 0 });
});

afterEach(() => {
  setOauthCodeTtlSeconds(300);
});

afterAll(async () => {
  const admin = adminClient();
  if (created.length > 0) {
    await admin.from('tasks').delete().in('id', created);
    await admin.from('tombstones').delete().in('id', created);
  }
  await server.close();
});

function authorizeBody(verifier: string, password: string): URLSearchParams {
  return new URLSearchParams({
    client_id: 'taskman-test',
    redirect_uri: 'http://127.0.0.1/callback',
    code_challenge: s256Challenge(verifier),
    code_challenge_method: 'S256',
    state: 's1',
    resource: server.url,
    email: DEV_USER.email,
    password,
  });
}

function login(verifier: string, password: string): Promise<Response> {
  return fetch(new URL('/authorize', server.url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: authorizeBody(verifier, password),
    redirect: 'manual',
  });
}

function exchange(code: string, verifier: string): Promise<Response> {
  return fetch(new URL('/token', server.url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'http://127.0.0.1/callback',
      client_id: 'taskman-test',
      code_verifier: verifier,
      resource: server.url,
    }),
  });
}

async function tool(name: string, args: Record<string, unknown>, accessToken: string): Promise<Record<string, unknown>> {
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
  });
  const client = new Client({ name: 'task-mcp-oauth-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
    if (result.isError) throw new Error(text);
    return JSON.parse(text) as Record<string, unknown>;
  } finally {
    await client.close();
  }
}

describe('MCP OAuth login', () => {
  it('keeps a bad password on the page', async () => {
    const response = await login(newVerifier(), 'not-the-password');
    expect(response.status).toBe(401);
    expect(response.headers.get('location')).toBeNull();
    const html = await response.text();
    expect(html).toContain('Wrong email or password.');
    expect(html).not.toContain('code=');
    expect(html).not.toMatch(/sign up|create account/i);
  });

  it('signs in, returns a token, and that token reads the user\'s tasks', async () => {
    const verifier = newVerifier();
    const response = await login(verifier, DEV_USER.password);
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.searchParams.get('state')).toBe('s1');
    expect(location.searchParams.get('iss')).toBe(new URL(server.url).origin);
    const code = location.searchParams.get('code');
    expect(code).toEqual(expect.any(String));

    const tokenResponse = await exchange(code!, verifier);
    expect(tokenResponse.status).toBe(200);
    const tokens = (await tokenResponse.json()) as { access_token: string; refresh_token?: string; token_type: string };
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.access_token.split('.')).toHaveLength(3);
    expect(tokens.refresh_token).toEqual(expect.any(String));

    const title = `OAuth ${crypto.randomUUID()}`;
    const createdTask = await tool('create_task', { title }, tokens.access_token);
    const task = createdTask.task as { id: string; title: string };
    created.push(task.id);
    const shown = await tool('task', { task: task.id }, tokens.access_token);
    expect((shown.task as { title: string }).title).toBe(title);

    const again = await exchange(code!, verifier);
    expect(again.status).toBe(400);
    expect(((await again.json()) as { error: string }).error).toBe('invalid_grant');

    const refreshed = await fetch(new URL('/token', server.url), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token! }),
    });
    expect(refreshed.status).toBe(200);
    const next = (await refreshed.json()) as { access_token: string };
    const reread = await tool('task', { task: task.id }, next.access_token);
    expect((reread.task as { id: string }).id).toBe(task.id);
  });

  it('rejects a missing code and an expired code', async () => {
    const missing = await exchange('missing-code', newVerifier());
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toBe('invalid_grant');

    setOauthCodeTtlSeconds(0);
    const verifier = newVerifier();
    const response = await login(verifier, DEV_USER.password);
    expect(response.status).toBe(303);
    const code = new URL(response.headers.get('location') ?? '').searchParams.get('code');
    expect(code).toEqual(expect.any(String));
    const expired = await exchange(code!, verifier);
    expect(expired.status).toBe(400);
    expect(((await expired.json()) as { error: string }).error).toBe('invalid_grant');
  });

  it('rejects a verifier that does not match the challenge', async () => {
    const response = await login(newVerifier(), DEV_USER.password);
    const code = new URL(response.headers.get('location') ?? '').searchParams.get('code')!;
    const wrong = await exchange(code, newVerifier());
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: string }).error).toBe('invalid_grant');
  });
});

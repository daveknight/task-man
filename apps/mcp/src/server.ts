import { createMcpHandler, type AuthInfo } from '@modelcontextprotocol/server';
import type { Scope } from '@app/data';
import { openUser } from './auth.ts';
import { createTaskServer } from './tools.ts';

const scopes = new WeakMap<AuthInfo, Scope>();

const handler = createMcpHandler((ctx) => {
  const scope = ctx.authInfo ? scopes.get(ctx.authInfo) : undefined;
  if (!scope) throw new Error('No signed-in user for this request.');
  return createTaskServer(scope);
});

/** MCP over HTTP. A missing or rejected token is answered here, before a tool runs. */
export async function authorizeAndServe(request: Request): Promise<Response> {
  const opened = await openUser(request.headers.get('authorization'));
  if (opened instanceof Response) return opened;
  scopes.set(opened.auth, opened.scope);
  try {
    return await handler.fetch(request, { authInfo: opened.auth });
  } finally {
    scopes.delete(opened.auth);
  }
}

/** The public MCP path. Other paths are not this protocol. */
export async function handleMcp(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path !== '/mcp' && path !== '/api/mcp') {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  return authorizeAndServe(request);
}

export async function closeHandler(): Promise<void> {
  await handler.close();
}

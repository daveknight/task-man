import { discoveryResponse } from './oauth/metadata.ts';
import { handleAuthorize, handleRegister, handleToken } from './oauth/http.ts';
import { handleMcp } from './server.ts';

function pathOf(request: Request): string {
  const path = new URL(request.url).pathname;
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** MCP, the browser login, and the OAuth endpoints clients discover from a 401. */
export async function handleHttp(request: Request): Promise<Response> {
  const discovered = discoveryResponse(request);
  if (discovered) return discovered;
  const path = pathOf(request);
  if (path === '/authorize') return handleAuthorize(request);
  if (path === '/token') return handleToken(request);
  if (path === '/register') return handleRegister(request);
  if (path === '/mcp' || path === '/api/mcp' || path === '/') return handleMcp(request);
  return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
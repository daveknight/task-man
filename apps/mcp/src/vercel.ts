import type { IncomingMessage, ServerResponse } from 'node:http';
import { toWebRequest } from '@modelcontextprotocol/node';
import { authorizeAndServe } from './server.ts';
import { writeNodeResponse } from './node-http.ts';

/**
 * Vercel Node entry. The project route is `/mcp`; `/` is the same function when the
 * platform mounts it at that path. Authorization is the same gate as the local server.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const request = await toWebRequest(req);
    const path = new URL(request.url).pathname;
    if (path !== '/mcp' && path !== '/' && path !== '/api/mcp') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    await writeNodeResponse(res, await authorizeAndServe(request));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'server_error' }));
    } else {
      res.end();
    }
  }
}

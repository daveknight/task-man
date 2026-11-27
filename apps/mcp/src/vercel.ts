import type { IncomingMessage, ServerResponse } from 'node:http';
import { toWebRequest } from '@modelcontextprotocol/node';
import { handleHttp } from './router.ts';
import { writeNodeResponse } from './node-http.ts';

/**
 * Vercel Node entry. The same function serves `/mcp` and the OAuth routes
 * (authorize, token, register, and the well-known metadata). Authorization of
 * tool calls is the same gate as the local server.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const request = await toWebRequest(req);
    await writeNodeResponse(res, await handleHttp(request));
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

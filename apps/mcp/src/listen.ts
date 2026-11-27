import { createServer, type Server } from 'node:http';
import { localhostHostValidation, localhostOriginValidation, toWebRequest } from '@modelcontextprotocol/node';
import { handleHttp } from './router.ts';
import { writeNodeResponse } from './node-http.ts';

export interface ListeningServer {
  url: string;
  close: () => Promise<void>;
}

/**
 * Local HTTP listener. Bound to loopback, and the host and origin checks refuse a browser
 * that reaches it through a DNS rebind. The hosted deploy does not use this listener.
 */
export function listen(options?: { port?: number; host?: string }): Promise<ListeningServer> {
  const host = options?.host ?? '127.0.0.1';
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  const server: Server = createServer((req, res) => {
    void (async () => {
      try {
        if (!validateHost(req, res) || !validateOrigin(req, res)) return;
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
    })();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options?.port ?? 0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://${host}:${port}/mcp`,
        close: () => new Promise((done, fail) => server.close((error) => (error ? fail(error) : done()))),
      });
    });
  });
}

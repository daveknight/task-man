import { closeHandler } from './server.ts';
import { listen } from './listen.ts';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
const server = await listen({ port, host });
console.log(`Task MCP listening on ${server.url}`);

async function shutdown(): Promise<void> {
  await server.close();
  await closeHandler();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

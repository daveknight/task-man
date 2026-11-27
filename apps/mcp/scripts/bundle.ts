import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, '.vercel/output');
const built = resolve(output, 'functions/mcp.func');

await mkdir(built, { recursive: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/vercel.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: resolve(built, 'index.js'),
  // Node built-ins stay as imports. Everything else, including the workspace
  // packages, is in this file so the function does not need a second install.
  packages: 'bundle',
});

const packageJson = `${JSON.stringify({ type: 'module' }, null, 2)}\n`;
const vcConfig = `${JSON.stringify(
  {
    runtime: 'nodejs22.x',
    handler: 'index.js',
    launcherType: 'Nodejs',
    shouldAddHelpers: true,
    supportsResponseStreaming: true,
  },
  null,
  2,
)}\n`;
await writeFile(resolve(built, 'package.json'), packageJson);
await writeFile(resolve(built, '.vc-config.json'), vcConfig);

// One bundle, copied to each route. Dest equals the request path so the function
// sees /authorize and the well-known paths, not a rewrite to /mcp.
const functionPaths = [
  'mcp',
  'authorize',
  'token',
  'register',
  '.well-known/oauth-authorization-server',
  '.well-known/oauth-protected-resource',
  '.well-known/oauth-protected-resource/mcp',
  '.well-known/oauth-protected-resource/api/mcp',
];
const bundle = await readFile(resolve(built, 'index.js'));
for (const functionPath of functionPaths) {
  if (functionPath === 'mcp') continue;
  const dir = resolve(output, 'functions', `${functionPath}.func`);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'index.js'), bundle);
  await writeFile(resolve(dir, 'package.json'), packageJson);
  await writeFile(resolve(dir, '.vc-config.json'), vcConfig);
}

function route(path: string): { src: string; dest: string } {
  return { src: path.replaceAll('.', '\\.'), dest: path };
}

await writeFile(
  resolve(output, 'config.json'),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/mcp', dest: '/mcp' },
        { src: '/mcp/(.*)', dest: '/mcp' },
        { src: '/api/mcp', dest: '/mcp' },
        ...['/authorize', '/token', '/register', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource'].map(route),
        { src: '/\\.well-known/oauth-protected-resource/(.*)', dest: '/.well-known/oauth-protected-resource/$1' },
      ],
    },
    null,
    2,
  )}\n`,
);

const handler = await import(pathToFileURL(resolve(built, 'index.js')).href);
if (typeof handler.default !== 'function') throw new Error('The Vercel bundle has no default request handler.');
console.log('Wrote .vercel/output for /mcp and the OAuth routes');

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, '.vercel/output');
const func = resolve(output, 'functions/mcp.func');

await mkdir(func, { recursive: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/vercel.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: resolve(func, 'index.js'),
  // Node built-ins stay as imports. Everything else, including the workspace
  // packages, is in this file so the function does not need a second install.
  packages: 'bundle',
});

await writeFile(resolve(func, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
await writeFile(
  resolve(func, '.vc-config.json'),
  `${JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
      shouldAddHelpers: true,
      supportsResponseStreaming: true,
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  resolve(output, 'config.json'),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/mcp', dest: '/mcp' },
        { src: '/mcp/(.*)', dest: '/mcp' },
      ],
    },
    null,
    2,
  )}\n`,
);

const built = await import(pathToFileURL(resolve(func, 'index.js')).href);
if (typeof built.default !== 'function') throw new Error('The Vercel bundle has no default request handler.');
console.log('Wrote .vercel/output for /mcp');

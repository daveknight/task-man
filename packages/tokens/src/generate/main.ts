import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokens } from '../tokens.ts';
import { targets } from './targets.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));

for (const target of targets) {
  const path = join(root, target.file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, target.render(tokens));
  console.log(`wrote ${target.file}`);
}

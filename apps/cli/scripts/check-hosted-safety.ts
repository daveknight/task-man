/**
 * Guards for "Deploy to production" on the Supabase GitHub integration. Usage:
 *   npm run check:hosted -w @app/cli -- [--base origin/main]
 * Without --base (or with a base git can't find) only the static checks run.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { configProblems, migrationProblems, seedProblems, type Change } from '../src/hosted-safety.ts';

const root = resolve(import.meta.dirname, '../../..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const { values } = parseArgs({ options: { base: { type: 'string' } } });

const problems = [
  ...configProblems(readFileSync(resolve(root, 'supabase/config.toml'), 'utf8')),
  ...seedProblems(readFileSync(resolve(root, 'supabase/seed.sql'), 'utf8')),
];

if (values.base) {
  let baseNames: string[] | null = null;
  try {
    baseNames = git('ls-tree', '--name-only', values.base, 'supabase/migrations/').split('\n').filter(Boolean).map((p) => p.split('/').pop()!);
  } catch {
    console.warn(`Base ${values.base} not found; skipping the migration history checks.`);
  }
  if (baseNames) {
    const changes = git('diff', '--name-status', '--no-renames', `${values.base}...HEAD`, '--', 'supabase/migrations/')
      .split('\n')
      .filter(Boolean)
      .map((line): Change => {
        const [status, path] = line.split('\t');
        return { status: status![0] as Change['status'], path: path! };
      });
    problems.push(...migrationProblems(changes, baseNames, (path) => readFileSync(resolve(root, path), 'utf8')));
  }
}

if (problems.length) {
  console.error(`Hosted safety check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('Hosted safety checks passed.');

/**
 * End-to-end seed check through the real CLI and local Supabase:
 * seeds at a pinned day, reads `board --json`, and compares every task's
 * placement with the hand-written `expect` in seed/tasks.json.
 *
 *   npm run check:seed -- 2026-11-18 2026-11-21
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { addDays, type Board } from '@app/core';
import type { BoardTask } from '../src/commands.ts';
import { DEFAULT_SEED_FILE } from '../src/config.ts';
import type { SeedFile } from '../src/seed-plan.ts';

const MAIN = new URL('../src/main.ts', import.meta.url).pathname;
const file = JSON.parse(readFileSync(DEFAULT_SEED_FILE, 'utf8')) as SeedFile;

function cli(...args: string[]): unknown {
  const out = execFileSync(process.execPath, ['--import', 'tsx', MAIN, ...args, '--json'], { encoding: 'utf8' });
  return JSON.parse(out);
}

function placements(board: Board<BoardTask>): Map<string, string> {
  const map = new Map<string, string>();
  for (const section of board.sections) {
    for (const task of [...section.tasks, ...(section.later ?? [])]) map.set(task.title, task.placement);
  }
  return map;
}

let failures = 0;
function fail(message: string): void {
  failures++;
  console.error(`  ✗ ${message}`);
}

const days = process.argv.slice(2);
if (days.length === 0) days.push('2026-11-18', '2026-11-21');

for (const today of days) {
  console.log(`Seed check at ${today}`);
  cli('seed', '--reset', '--today', today);
  const board = cli('board', '--today', today, '--completed', '--trash') as Board<BoardTask>;
  const actual = placements(board);

  if (actual.size !== file.tasks.length) fail(`expected ${file.tasks.length} tasks on the board, got ${actual.size}`);
  for (const task of file.tasks) {
    const got = actual.get(task.title);
    if (got !== task.expect) fail(`"${task.title}": expected ${task.expect}, got ${got}`);
  }

  // Ready keeps the seed file's order.
  const ready = board.sections.find((s) => s.id === 'ready')!.tasks.map((t) => t.title);
  const expectedReady = file.tasks.filter((t) => t.expect === 'ready').map((t) => t.title);
  if (JSON.stringify(ready) !== JSON.stringify(expectedReady)) fail('Ready is not in seed file order');

  // A start date of tomorrow arrives at the bottom of Ready the next day.
  const tomorrow = cli('board', '--today', addDays(today, 1)) as Board<BoardTask>;
  const startsTomorrow = file.tasks.filter((t) => t.start === '+1d').map((t) => t.title);
  const tomorrowReady = tomorrow.sections.find((s) => s.id === 'ready')!.tasks.map((t) => t.title);
  for (const title of startsTomorrow) {
    if (!tomorrowReady.includes(title)) fail(`"${title}" should be in Ready on ${addDays(today, 1)}`);
  }
  if (startsTomorrow.length > 0 && tomorrowReady.at(-1) !== startsTomorrow.at(-1)) {
    fail(`"${startsTomorrow.at(-1)}" should be at the bottom of Ready on ${addDays(today, 1)}`);
  }

  if (failures === 0) console.log(`  ✓ all ${file.tasks.length} tasks where expected`);
}

if (failures > 0) {
  console.error(`${failures} seed expectation(s) failed`);
  process.exit(1);
}

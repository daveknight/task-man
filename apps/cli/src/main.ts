import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { APP_NAME, localDate, resolveDate, type ISODate } from '@app/core';
import { loadBoard, reset, seed } from './commands.ts';
import { DEFAULT_SEED_FILE } from './config.ts';
import { adminClient, devUserId } from './db.ts';
import { formatBoard } from './format.ts';

const USAGE = `${APP_NAME} CLI (local Supabase only)

Usage: npm run cli -- <command> [options]

Commands:
  seed [--file seed/tasks.json] [--reset]   load fixtures, dates relative to today
  reset                                     wipe all data for the dev user
  board [--completed] [--trash]             the main view, grouped and ordered like the app

Options (every command):
  --today <date>   override today: YYYY-MM-DD or relative to the real today (+1d, -2w, +1m)
  --json           machine-readable output
  --help
`;

function today(value: string | undefined): ISODate {
  const real = localDate();
  return value ? resolveDate(value, real) : real;
}

async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      today: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      file: { type: 'string' },
      reset: { type: 'boolean', default: false },
      completed: { type: 'boolean', default: false },
      trash: { type: 'boolean', default: false },
    },
  });
  const [command] = positionals;
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return;
  }

  const json = values.json;
  const print = (data: unknown, text: string) => process.stdout.write(json ? `${JSON.stringify(data, null, 2)}\n` : `${text}\n`);
  const day = today(values.today);
  const db = adminClient();
  const userId = await devUserId(db);

  switch (command) {
    case 'seed': {
      const file = values.file ? resolve(process.env.INIT_CWD ?? process.cwd(), values.file) : DEFAULT_SEED_FILE;
      const result = await seed(db, userId, { file, today: day, reset: values.reset });
      const skipped = Object.entries(result.skipped)
        .filter(([, n]) => n > 0)
        .map(([field, n]) => `${field} on ${n}`)
        .join(', ');
      print(
        result,
        `${result.reset ? `Reset (${result.reset.tasks} tasks removed). ` : ''}Seeded ${result.tasks} tasks for ${day}` +
          (skipped ? `; skipped until their phase: ${skipped}.` : '.'),
      );
      return;
    }
    case 'reset': {
      const result = await reset(db, userId);
      print(result, `Removed ${result.tasks} tasks, ${result.tags} tags and ${result.tombstones} tombstones.`);
      return;
    }
    case 'board': {
      const board = await loadBoard(db, userId, { today: day, completed: values.completed, trash: values.trash });
      print(board, formatBoard(board));
      return;
    }
    default:
      throw new Error(`Unknown command "${command}". Run with --help.`);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  else process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});

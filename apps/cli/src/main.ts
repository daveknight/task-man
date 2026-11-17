import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { APP_NAME, localDate, resolveDate, type ISODate } from '@app/core';
import { exportAll, importAll, type Backup } from './backup.ts';
import { loadBoard, reset, seed } from './commands.ts';
import { DEFAULT_SEED_FILE } from './config.ts';
import { adminClient, devUserId } from './db.ts';
import { formatBoard, formatTask } from './format.ts';
import {
  addTask,
  DecisionNeeded,
  deleteTask,
  doneTask,
  editTask,
  moveTask,
  purge,
  restoreTask,
  runAction,
  search,
  setStatus,
  showTask,
  undoneTask,
  type Changed,
  type Context,
} from './tasks.ts';

const USAGE = `${APP_NAME} CLI (local Supabase only)

Usage: npm run -s cli -- <command> [options]

Board and data:
  seed [--file seed/tasks.json] [--reset]   load fixtures, dates relative to today
  reset                                     wipe all data for the dev user
  board [--completed] [--trash]             the main view, grouped and ordered like the app
  export                                    print a JSON backup (redirect it to a file)
  import <file> [--reset]                   load a backup; --reset replaces existing data

Tasks (<task> is an id, an id prefix of 4+ characters, or a title prefix):
  add "Title" [--desc text] [--start <date>] [--due <date>] [--status open|in_progress|waiting] [--flag]
  show <task>                               fields, placement and the actions the app offers
  edit <task> [--title t] [--desc text] [--start <date>|none] [--due <date>|none] [--flag|--no-flag]
  status <task> open|in_progress|waiting [--start clear|keep|<date>|none]
  act <task> <action> [--date <date>] [--start clear|keep|<date>]
                                            a row action, as in the app: due.tomorrow, waitUntil.saturday,
                                            extendWait.week, checkBack.now, start.pick --date +5d,
                                            moveToInProgress, startNow, markNotDone, restore
  move <task> --top | --before <task> | --after <task> [--start ...]
                                            drag-and-drop: reorder, or move into another section
  done <task> [--on <date>]    undone <task>
  delete <task> [--forever]    restore <task>
  purge-trash                               permanently remove Trash older than 30 days
  search "query" [--completed] [--flagged]  title and description; never Trash

Status changes never change dates silently. When one would (leaving Waiting with a future
check-back date, or going into Waiting with a future start), it fails with the question
unless --start answers it. Going into Waiting, --start <date>|none sets the check-back date.

Options (every command):
  --today <date>   override today: YYYY-MM-DD or relative to the real today (+1d, -2w, +1m)
  --json           machine-readable output
  --help

Dates: YYYY-MM-DD, today, or relative to today: +3d, -2d, +2w, +1m, +1y.
`;

const PHASE_2_FLAGS = ['tags', 'repeat', 'repeat-mode', 'start-offset', 'subtask'] as const;

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
      desc: { type: 'string' },
      title: { type: 'string' },
      start: { type: 'string' },
      due: { type: 'string' },
      status: { type: 'string' },
      flag: { type: 'boolean' },
      'no-flag': { type: 'boolean' },
      flagged: { type: 'boolean', default: false },
      date: { type: 'string' },
      on: { type: 'string' },
      before: { type: 'string' },
      after: { type: 'string' },
      top: { type: 'boolean', default: false },
      forever: { type: 'boolean', default: false },
      tags: { type: 'string' },
      repeat: { type: 'string' },
      'repeat-mode': { type: 'string' },
      'start-offset': { type: 'string' },
      subtask: { type: 'string', multiple: true },
    },
  });
  const [command, ...args] = positionals;
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return;
  }
  for (const flag of PHASE_2_FLAGS) {
    if (values[flag] !== undefined) throw new Error(`--${flag} arrives with Phase 2`);
  }

  const json = values.json;
  const print = (data: unknown, text: string): void => {
    process.stdout.write(json ? `${JSON.stringify(data, null, 2)}\n` : `${text}\n`);
  };
  const day = today(values.today);
  const db = adminClient();
  const ctx: Context = { scope: { db, userId: await devUserId(db) }, today: day, now: new Date().toISOString() };
  const arg = (i: number, name: string) => {
    const value = args[i];
    if (value === undefined) throw new Error(`${command} needs ${name}. Run with --help.`);
    return value;
  };
  const printChanged = (result: Changed, verb: string) => print(result, `${verb} ${formatTask(result, day)}${result.note ? `\n${result.note}` : ''}`);
  const flag = values.flag ? true : values['no-flag'] ? false : undefined;

  switch (command) {
    case 'seed': {
      const file = values.file ? resolve(process.env.INIT_CWD ?? process.cwd(), values.file) : DEFAULT_SEED_FILE;
      const result = await seed(db, ctx.scope.userId, { file, today: day, reset: values.reset });
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
      const result = await reset(db, ctx.scope.userId);
      print(result, `Removed ${result.tasks} tasks, ${result.tags} tags and ${result.tombstones} tombstones.`);
      return;
    }
    case 'board': {
      const board = await loadBoard(db, ctx.scope.userId, { today: day, completed: values.completed, trash: values.trash });
      print(board, formatBoard(board));
      return;
    }
    case 'add':
      return printChanged(
        await addTask(ctx, arg(0, 'a title'), { description: values.desc, start: values.start, due: values.due, status: values.status, flag: values.flag }),
        'Added',
      );
    case 'show': {
      const result = await showTask(ctx, arg(0, 'a task'));
      const t = result.task;
      print(
        result,
        [
          formatTask(result, day),
          `  id ${t.id}`,
          `  status ${t.status}${t.flagged ? ' · flagged' : ''}${result.sortKey ? ` · sort key ${result.sortKey}` : ''}`,
          ...(t.description ? ['', ...t.description.split('\n').map((l) => `  ${l}`), ''] : []),
          `  actions: ${result.actions.join(' | ')}`,
        ].join('\n'),
      );
      return;
    }
    case 'edit':
      return printChanged(
        await editTask(ctx, arg(0, 'a task'), { title: values.title, description: values.desc, start: values.start, due: values.due, flag }),
        'Edited',
      );
    case 'status':
      return printChanged(await setStatus(ctx, arg(0, 'a task'), arg(1, 'a status'), values.start), 'Moved');
    case 'act':
      return printChanged(await runAction(ctx, arg(0, 'a task'), arg(1, 'an action'), { date: values.date, start: values.start }), 'Updated');
    case 'move':
      return printChanged(await moveTask(ctx, arg(0, 'a task'), { before: values.before, after: values.after, top: values.top, start: values.start }), 'Moved');
    case 'done':
      return printChanged(await doneTask(ctx, arg(0, 'a task'), values.on), 'Completed');
    case 'undone':
      return printChanged(await undoneTask(ctx, arg(0, 'a task')), 'Not done:');
    case 'delete':
      return printChanged(await deleteTask(ctx, arg(0, 'a task'), values.forever), values.forever ? 'Deleted forever:' : 'Moved to Trash:');
    case 'restore':
      return printChanged(await restoreTask(ctx, arg(0, 'a task')), 'Restored');
    case 'purge-trash': {
      const ids = await purge(ctx);
      print({ today: day, purged: ids }, `Purged ${ids.length} task${ids.length === 1 ? '' : 's'} deleted before ${resolveDate('-30d', day)}.`);
      return;
    }
    case 'search': {
      const results = await search(ctx, args[0] ?? '', { completed: values.completed, flagged: values.flagged });
      print(results, results.length ? results.map((r) => formatTask(r, day)).join('\n') : 'No matches.');
      return;
    }
    case 'export': {
      process.stdout.write(`${JSON.stringify(await exportAll(ctx.scope), null, 2)}\n`);
      return;
    }
    case 'import': {
      const file = resolve(process.env.INIT_CWD ?? process.cwd(), arg(0, 'a backup file'));
      const result = await importAll(ctx.scope, JSON.parse(readFileSync(file, 'utf8')) as Backup, values.reset);
      print(result, `Imported ${result.tasks} tasks and ${result.positions} positions.`);
      return;
    }
    default:
      throw new Error(`Unknown command "${command}". Run with --help.`);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes('--json')) {
    const decision = error instanceof DecisionNeeded ? { decision: error.decision, task: error.task.id, to: error.to } : {};
    process.stdout.write(`${JSON.stringify({ error: message, ...decision })}\n`);
  } else process.stderr.write(`Error: ${message}\n`);
  process.exitCode = error instanceof DecisionNeeded ? 2 : 1;
});

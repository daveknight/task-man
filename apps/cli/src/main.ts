import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { APP_NAME, localDate, resolveDate, type ISODate } from '@app/core';
import { exportAll, importAll, type Backup, type BackupV1 } from './backup.ts';
import { loadBoard, reset, seed } from './commands.ts';
import { DEFAULT_SEED_FILE } from './config.ts';
import { adminClient, devUserId } from './db.ts';
import { formatBoard, formatSubtasks, formatTask } from './format.ts';
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
  add "Title" [--desc text] [--start <date>] [--hide-until <date>] [--due <date>] [--status open|in_progress|waiting] [--flag]
              [--subtask "text" ...]
  show <task>                               fields, subtasks, placement and the actions the app offers
  edit <task> [--title t] [--desc text] [--start <date>|none] [--hide-until <date>|none] [--due <date>|none]
              [--flag|--no-flag]
              [--add-subtask "text" ...] [--done-subtask <subtask> ...] [--undone-subtask <subtask> ...]
              [--rename-subtask <subtask>=<new title> ...] [--move-subtask <subtask>=<position> ...]
              [--remove-subtask <subtask> ...]
  status <task> open|in_progress|waiting [--hide-until <date>|none]
  act <task> <action> [--date <date>] [--hide-until <date>|none]
                                            a row action, as in the app: due.tomorrow, moveToWaiting --hide-until +3d,
                                            extendWait.week, checkBack.now, start.pick --date +5d,
                                            moveToInProgress, startNow, markNotDone, restore
  move <task> --top | --before <task> | --after <task> [--hide-until <date>|none]
                                            drag-and-drop: reorder, or move into another section
  move <task> --upcoming --start <date> [--clear-due]
                                            drop into Upcoming: Open, starting on that date
  done <task> [--on <date>]    undone <task>
  delete <task> [--forever]    restore <task>
  purge-trash                               permanently remove Trash older than 30 days
  search "query" [--completed] [--flagged]  title and description; never Trash
                                            --completed: include completed, --flagged: only flagged

A <subtask> is its position as 'show' lists it (1 is the top), an id prefix of 4+ characters, or a title prefix.
Within one edit they are resolved against the list as it was before: renames and ticks first, then removals,
then new subtasks at the bottom, and moves last (so --move-subtask x=1 puts x at the top of the final list).
'show', 'board --json' and every change report include the task's subtasks and subtaskCount ({ done, total }).

Only Ready and Upcoming tasks have a start date, and only Waiting tasks have a hide-until date.
--start on a Waiting or In Progress task fails; --hide-until on any other task fails. Status
changes never ask: going into Waiting or In Progress clears the start date, and leaving Waiting
clears the hide-until date. Going into Waiting, --hide-until <date>|none answers the Hide until
picker (none, or leaving it out, is Don't hide). The old --start clear|keep|<date> answers are gone.
Moving a task due today or earlier into Upcoming fails with exit code 2 unless --clear-due removes
the due date. Upcoming tasks start after today, and a start can't be after the due date.

Options (every command):
  --today <date>   override today: YYYY-MM-DD or relative to the real today (+1d, -2w, +1m)
  --json           machine-readable output
  --help

Dates: YYYY-MM-DD, today, or relative to today: +3d, -2d, +2w, +1m, +1y.
`;

const PHASE_2_FLAGS = ['tags', 'repeat', 'repeat-mode', 'start-offset'] as const;

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
      'hide-until': { type: 'string' },
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
      upcoming: { type: 'boolean', default: false },
      'clear-due': { type: 'boolean', default: false },
      forever: { type: 'boolean', default: false },
      tags: { type: 'string' },
      repeat: { type: 'string' },
      'repeat-mode': { type: 'string' },
      'start-offset': { type: 'string' },
      subtask: { type: 'string', multiple: true },
      'add-subtask': { type: 'string', multiple: true },
      'done-subtask': { type: 'string', multiple: true },
      'undone-subtask': { type: 'string', multiple: true },
      'remove-subtask': { type: 'string', multiple: true },
      'rename-subtask': { type: 'string', multiple: true },
      'move-subtask': { type: 'string', multiple: true },
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
        `${result.reset ? `Reset (${result.reset.tasks} tasks removed). ` : ''}Seeded ${result.tasks} tasks and ${result.subtasks} subtasks for ${day}` +
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
        await addTask(ctx, arg(0, 'a title'), { description: values.desc, start: values.start, hideUntil: values['hide-until'], due: values.due, status: values.status, flag: values.flag, subtasks: values.subtask }),
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
          ...formatSubtasks(t.subtasks),
          `  actions: ${result.actions.join(' | ')}`,
        ].join('\n'),
      );
      return;
    }
    case 'edit':
      return printChanged(
        await editTask(ctx, arg(0, 'a task'), { title: values.title, description: values.desc, start: values.start, hideUntil: values['hide-until'], due: values.due,
          flag,
          subtasks: {
            add: values['add-subtask'],
            done: values['done-subtask'],
            undone: values['undone-subtask'],
            remove: values['remove-subtask'],
            rename: values['rename-subtask'],
            move: values['move-subtask'],
          },
        }),
        'Edited',
      );
    case 'status':
      return printChanged(await setStatus(ctx, arg(0, 'a task'), arg(1, 'a status'), { start: values.start, hideUntil: values['hide-until'] }), 'Moved');
    case 'act':
      return printChanged(await runAction(ctx, arg(0, 'a task'), arg(1, 'an action'), { date: values.date, start: values.start, hideUntil: values['hide-until'] }), 'Updated');
    case 'move':
      return printChanged(await moveTask(ctx, arg(0, 'a task'), {
            before: values.before,
            after: values.after,
            top: values.top,
            upcoming: values.upcoming,
            clearDue: values['clear-due'],
            start: values.start,
            hideUntil: values['hide-until'],
          }), 'Moved');
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
      const result = await importAll(ctx.scope, JSON.parse(readFileSync(file, 'utf8')) as Backup | BackupV1, values.reset);
      print(result, `Imported ${result.tasks} tasks, ${result.positions} positions and ${result.subtasks} subtasks.`);
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

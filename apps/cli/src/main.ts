import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { APP_NAME, CAPTURE_MAX_CHARS, localDate, resolveDate, type ISODate } from '@app/core';
import { loadSnapshot } from '@app/data';
import { exportAll, importAll, type Backup, type BackupV1 } from './backup.ts';
import { applyCapture, captureJson, fetchCaptureReply, formatCapture, recordedReply, reviewRecorded } from './capture.ts';
import { loadBoard, loadCompletedLog, reset, seed } from './commands.ts';
import { DEFAULT_SEED_FILE } from './config.ts';
import { adminClient, devUserId } from './db.ts';
import { formatBoard, formatCompletedLog, formatHistory, formatRepeat, formatSubtasks, formatTask } from './format.ts';
import { hasRepeatFlags, type RepeatFlags } from './repeat-flags.ts';
import {
  addTask,
  DecisionNeeded,
  deleteTag,
  deleteTask,
  doneTask,
  editTask,
  historyTask,
  listTags,
  moveTask,
  purge,
  renameTag,
  restoreTask,
  runAction,
  search,
  setStatus,
  showTask,
  skipTask,
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
  log                                       what you finished, by week and day, newest first
  export                                    print a JSON backup (redirect it to a file)
  import <file> [--reset]                   load a backup; --reset replaces existing data

Tasks (<task> is an id, an id prefix of 4+ characters, or a title prefix):
  add "Title" [--desc text] [--start <date>] [--hide-until <date>] [--due <date>] [--status open|in_progress|waiting] [--flag]
              [--subtask "text" ...] [--tags a,b]
              [--repeat daily|weekly|monthly|yearly|weekdays|none] [--repeat-mode schedule|after_completion|dates]
              [--interval N] [--by-weekday mon,wed] [--monthly 31|last|2nd tue] [--dates d,d] [--start-offset N|none]
              [--ends never|<date>|count:N]
  show <task>                               fields, subtasks, placement and the actions the app offers
  edit <task> [--title t] [--desc text] [--start <date>|none] [--hide-until <date>|none] [--due <date>|none]
              [--flag|--no-flag] [--tags a,b]
              [--repeat ...] [--repeat-mode ...] [--interval N] [--by-weekday mon,wed] [--monthly ...]
              [--dates d,d] [--start-offset N|none] [--ends ...]
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
  done <task> [--on <date>]    undone <task>    skip <task> [--on <date>]
  history <task>                            field changes and occurrences, oldest first
  delete <task> [--forever]    restore <task>
  purge-trash                               permanently remove Recently deleted older than 30 days
  search "query" [--completed] [--flagged] [--tag <tag> ...]
                                            title, description and tag names; never Recently deleted
                                            --completed: include completed, --flagged: only flagged,
                                            --tag (repeat it): only tasks that have every one of these tags
  capture "note" [--provider gemini|claude|openai] [--apply]
                                            propose tasks to add or change, and save nothing
  capture --example <id> [--apply]          replay a recorded reply from seed/capture-examples.json
  capture "note" --reply <file> [--apply]   replay a saved model reply instead of calling a provider
  tags                                      every tag with how many tasks still to do have it
  tags rename <tag> <new name>              rename a tag on every task at once
  tags delete <tag>                         delete a tag and remove it from every task (the tasks stay)

--tags a,b gives a task exactly these tags (--tags "" clears them) and creates any that don't exist. Tag names are
unique ignoring case, at most 30 characters, with no commas. A <tag> is its name (any case) or an id prefix of 4+ characters.
'show', 'board --json' and every change report include the task's tags, in the order they were added.

A <subtask> is its position as 'show' lists it (1 is the top), an id prefix of 4+ characters, or a title prefix.
Within one edit they are resolved against the list as it was before: renames and ticks first, then removals,
then new subtasks at the bottom, and moves last (so --move-subtask x=1 puts x at the top of the final list).
'show', 'board --json' and every change report include the task's subtasks and subtaskCount ({ done, total }).

capture prints the proposed changes and saves nothing. --apply writes the ones that passed the check.
An update or a note is matched to tasks on this device. Several matches are listed and not saved.
--example and --reply replay a recorded reply and never call a provider. With no key set, a live
capture reports that it isn't set up and still saves nothing. The provider key stays in the Edge Function.

A repeat is one rule on the task. --repeat sets daily, weekly, monthly, yearly or weekdays (Mon–Fri); --repeat-mode
picks schedule (by due date, the default), after_completion or dates. dates mode takes --dates. --monthly is 31,
last, or an nth weekday such as "2nd tue". --ends is never, a date (that day is included) or count:N (completions
and skips). --start-offset N shows the task N days before each due date (0 means the due date; leaving it off
means no start date). A repeat with no due date uses today, or the first listed date. done --on and skip --on
record that calendar day. history lists one task's field changes, completions and skips, oldest
first. history --json is that same timeline. Each occurrence row keeps what it left behind and
whether it can still be undone. A field change has no undo. log lists everything finished, newest first, grouped by week and day: one-off
completions and each recorded completion of a repeating task, with skips left out. undone restores
the latest one until the task is edited. --repeat none clears the rule.

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
      tag: { type: 'string', multiple: true },
      repeat: { type: 'string' },
      'repeat-mode': { type: 'string' },
      'start-offset': { type: 'string' },
      interval: { type: 'string' },
      'by-weekday': { type: 'string' },
      monthly: { type: 'string' },
      dates: { type: 'string' },
      ends: { type: 'string' },
      apply: { type: 'boolean', default: false },
      reply: { type: 'string' },
      example: { type: 'string' },
      provider: { type: 'string' },
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
  const json = values.json;
  const print = (data: unknown, text: string): void => {
    process.stdout.write(json ? `${JSON.stringify(data, null, 2)}\n` : `${text}\n`);
  };
  const day = today(values.today);
  if (command === 'capture' && (values.example || values.reply) && !values.apply) {
    const recorded = recordedReply({ example: values.example, reply: values.reply, text: args.join(' ').trim() });
    const review = reviewRecorded(recorded.reply, day, recorded.tasks);
    print(captureJson(recorded.input, day, review, null), formatCapture(review, day, null));
    return;
  }
  const db = adminClient();
  const ctx: Context = { scope: { db, userId: await devUserId(db) }, today: day, now: new Date().toISOString() };
  const arg = (i: number, name: string) => {
    const value = args[i];
    if (value === undefined) throw new Error(`${command} needs ${name}. Run with --help.`);
    return value;
  };
  const printChanged = (result: Changed, verb: string) => print(result, `${verb} ${formatTask(result, day)}${result.note ? `\n${result.note}` : ''}`);
  const flag = values.flag ? true : values['no-flag'] ? false : undefined;
  const repeatFlags = (): RepeatFlags => ({
    repeat: values.repeat,
    mode: values['repeat-mode'],
    interval: values.interval,
    byWeekday: values['by-weekday'],
    monthly: values.monthly,
    dates: values.dates,
    startOffset: values['start-offset'],
    ends: values.ends,
  });
  const repeat = () => {
    const flags = repeatFlags();
    return hasRepeatFlags(flags) ? flags : undefined;
  };

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
        `${result.reset ? `Reset (${result.reset.tasks} tasks removed). ` : ''}Seeded ${result.tasks} tasks, ${result.subtasks} subtasks and ${result.tags} tags for ${day}` +
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
    case 'log': {
      const log = await loadCompletedLog(db, ctx.scope.userId, day);
      print(log, formatCompletedLog(log));
      return;
    }
    case 'add':
      return printChanged(
        await addTask(ctx, arg(0, 'a title'), { description: values.desc, start: values.start, hideUntil: values['hide-until'], due: values.due, status: values.status, flag: values.flag, subtasks: values.subtask, tags: values.tags, repeat: repeat() }),
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
          ...(t.repeat ? [`  repeat ${formatRepeat(t.repeat, t.dueDate)}`] : []),
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
          tags: values.tags,
          repeat: repeat(),
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
    case 'skip':
      return printChanged(await skipTask(ctx, arg(0, 'a task'), values.on), 'Skipped');
    case 'history': {
      const rows = await historyTask(ctx, arg(0, 'a task'));
      print(rows, formatHistory(rows));
      return;
    }
    case 'undone':
      return printChanged(await undoneTask(ctx, arg(0, 'a task')), 'Not done:');
    case 'delete':
      return printChanged(await deleteTask(ctx, arg(0, 'a task'), values.forever), values.forever ? 'Deleted forever:' : 'Moved to Recently deleted:');
    case 'restore':
      return printChanged(await restoreTask(ctx, arg(0, 'a task')), 'Restored');
    case 'purge-trash': {
      const ids = await purge(ctx);
      print({ today: day, purged: ids }, `Purged ${ids.length} task${ids.length === 1 ? '' : 's'} deleted before ${resolveDate('-30d', day)}.`);
      return;
    }
    case 'tags': {
      const [action, ...rest] = args;
      if (action === 'rename') {
        const name = rest.slice(1).join(' ');
        if (rest[0] === undefined || name === '') throw new Error('tags rename needs <tag> and <new name>. Run with --help.');
        const result = await renameTag(ctx, rest[0], name);
        print(result, result.tag.name === result.from ? `Tag “${result.from}” is already named that.` : `Renamed tag “${result.from}” to “${result.tag.name}”.`);
        return;
      }
      if (action === 'delete') {
        if (rest[0] === undefined) throw new Error('tags delete needs <tag>. Run with --help.');
        const result = await deleteTag(ctx, rest[0]);
        print(result, `Deleted tag “${result.tag.name}” (removed from ${result.tasks} task${result.tasks === 1 ? '' : 's'}).`);
        return;
      }
      if (action !== undefined) throw new Error(`Unknown tags command "${action}" (rename, delete). Run with --help.`);
      const listing = await listTags(ctx);
      print(listing, listing.length ? listing.map((t) => `${String(t.count).padStart(3)}  ${t.name}`).join('\n') : 'No tags.');
      return;
    }
    case 'capture': {
      if (values.provider && values.provider !== 'gemini' && values.provider !== 'claude' && values.provider !== 'openai') {
        throw new Error('Provider must be gemini, claude or openai.');
      }
      const text = args.join(' ').trim();
      const recorded = values.example || values.reply ? recordedReply({ example: values.example, reply: values.reply, text }) : null;
      if (!recorded && !text) throw new Error('capture needs the note, or --example <id>. Run with --help.');
      if (!recorded && text.length > CAPTURE_MAX_CHARS) throw new Error("That's too long to capture. Shorten it and try again.");
      const snapshot = await loadSnapshot(ctx.scope);
      const reply = recorded
        ? recorded.reply
        : await fetchCaptureReply({
            text,
            today: day,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            tags: snapshot.tags.map((tag) => tag.name),
            ...(values.provider ? { provider: values.provider } : {}),
          });
      const review = reviewRecorded(reply, day, snapshot.tasks);
      const saved = values.apply ? await applyCapture(ctx.scope, day, review.cards) : null;
      const input = recorded?.input ?? text;
      print(
        captureJson(input, day, review, saved ? saved.map((task) => ({ id: task.id, title: task.title })) : null),
        formatCapture(review, day, saved ? saved.length : null),
      );
      return;
    }
    case 'search': {
      const results = await search(ctx, args[0] ?? '', { completed: values.completed, flagged: values.flagged, tags: values.tag });
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
      print(result, `Imported ${result.tasks} tasks, ${result.positions} positions, ${result.subtasks} subtasks and ${result.tags} tags.`);
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

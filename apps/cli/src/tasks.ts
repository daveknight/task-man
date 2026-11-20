import {
  actionsFor,
  applyDateEffect,
  applyPlan,
  buildBoard,
  changeStatus,
  complete,
  markNotDone,
  placementFor,
  planChange,
  planDrop,
  planNewTask,
  planUpcomingDrop,
  REORDERABLE,
  resolveDate,
  restore,
  sectionFor,
  setDueDate,
  softDelete,
  waitUntil,
  type ISODate,
  type PositionWrite,
  type Preset,
  type Section,
  type StartChoice,
  type StartDecision,
  type Status,
  type Task,
  type UpcomingDropDecision,
} from '@app/core';
import { deleteForever, insertTask, loadSnapshot, purgeTrash, searchTasks, writeChange, type Scope, type Snapshot } from '@app/data';

export interface Context {
  scope: Scope;
  today: ISODate;
  /** The timestamp written for completions and deletions. */
  now: string;
}

/**
 * A change needs an answer the script didn't give: a start-date choice for a status change
 * (`--start clear|keep|<date>`), or `--clear-due` for a move into Upcoming of a task due today or earlier.
 */
export class DecisionNeeded extends Error {
  constructor(
    readonly task: Task,
    readonly to: Status | 'upcoming',
    readonly decision: StartDecision | UpcomingDropDecision,
  ) {
    super(decisionQuestion(task, decision));
  }
}

function decisionQuestion(task: Task, decision: StartDecision | UpcomingDropDecision): string {
  if (decision.reason === 'due_today_or_earlier') {
    return `"${task.title}" is due ${decision.dueDate}. Upcoming tasks start after today, and a start can't be after the due date (${decision.reason}). Pass --clear-due to remove the due date.`;
  }
  if (decision.reason === 'leaving_waiting_start_after_due') {
    return (
      `"${task.title}" is hidden until ${decision.startDate}, after its due date ${decision.dueDate}. ` +
      `Leaving Waiting clears that start date. Pass --start clear.`
    );
  }
  const opts = decision.options.map((o) => (o === 'set' ? '<date>' : o)).join('|');
  const what = decision.reason === 'entering_waiting_future_start' ? 'a future start date' : `a hide-until date of ${decision.startDate}`;
  return `"${task.title}" has ${what} (${decision.reason}). Pass --start ${opts} (default: ${decision.default}).`;
}

export interface Changed {
  task: Task;
  placement: string;
  /** Extra information, such as "Start moved to 2026-11-20". */
  note?: string;
}

function changed(task: Task, today: ISODate, note?: string): Changed {
  return { task, placement: placementFor(task, today), ...(note ? { note } : {}) };
}

/** Finds a task by id, id prefix (at least 4 characters) or title prefix (case-insensitive). */
export function findTask(snapshot: Snapshot, ref: string): Task {
  const exact = snapshot.tasks.find((t) => t.id === ref);
  if (exact) return exact;
  const needle = ref.toLowerCase();
  const byId = needle.length >= 4 ? snapshot.tasks.filter((t) => t.id.startsWith(needle)) : [];
  const matches = byId.length > 0 ? byId : snapshot.tasks.filter((t) => t.title.toLowerCase().startsWith(needle));
  if (matches.length === 1) return matches[0]!;
  const sameTitle = matches.filter((t) => t.title.toLowerCase() === needle);
  if (sameTitle.length === 1) return sameTitle[0]!;
  if (matches.length === 0) throw new Error(`No task matches "${ref}"`);
  const list = matches.slice(0, 8).map((t) => `  ${t.id.slice(0, 8)}  ${t.title}`).join('\n');
  throw new Error(`"${ref}" matches ${matches.length} tasks; use more of the id or title:\n${list}`);
}

/** `--start`: clear, keep, or a date (absolute or relative to today). */
export function parseStartChoice(value: string | undefined, today: ISODate): StartChoice | undefined {
  if (value === undefined) return undefined;
  if (value === 'clear' || value === 'keep') return value;
  return { set: resolveDate(value, today) };
}

/** A date flag: a date, a relative date, or "none" to clear it. */
export function parseDateFlag(value: string | undefined, today: ISODate): ISODate | null | undefined {
  if (value === undefined) return undefined;
  return value === 'none' ? null : resolveDate(value, today);
}

async function commit(ctx: Context, snapshot: Snapshot, before: Task, after: Task, drop?: PositionWrite[], note?: string): Promise<Changed> {
  const plan = planChange(snapshot.tasks, snapshot.positions, before, after, ctx.today, drop);
  await writeChange(ctx.scope, after.id, plan);
  Object.assign(snapshot, applyPlan(snapshot.tasks, snapshot.positions, after, plan));
  return changed(after, ctx.today, note);
}

export interface AddOptions {
  description?: string;
  start?: string;
  due?: string;
  status?: string;
  flag?: boolean;
}

function parseStatus(value: string): Status {
  const status = value === 'ready' ? 'open' : value.replace('-', '_');
  if (status !== 'open' && status !== 'in_progress' && status !== 'waiting') throw new Error(`Unknown status "${value}" (open, in_progress, waiting)`);
  return status;
}

export async function addTask(ctx: Context, title: string, options: AddOptions): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const task: Task = {
    id: crypto.randomUUID(),
    title: title.trim(),
    description: options.description ?? '',
    status: options.status ? parseStatus(options.status) : 'open',
    flagged: options.flag ?? false,
    startDate: parseDateFlag(options.start, ctx.today) ?? null,
    dueDate: parseDateFlag(options.due, ctx.today) ?? null,
  };
  const positions = planNewTask(snapshot.tasks, snapshot.positions, task, ctx.today);
  const saved = await insertTask(ctx.scope, task, positions);
  return changed(saved, ctx.today);
}

export interface EditOptions {
  title?: string;
  description?: string;
  start?: string;
  due?: string;
  flag?: boolean;
}

/** Field edits. A due date before the start moves the start (except while Waiting), like the app. */
export async function editTask(ctx: Context, ref: string, options: EditOptions): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const before = findTask(snapshot, ref);
  let after: Task = { ...before };
  let note: string | undefined;
  if (options.title !== undefined) after.title = options.title;
  if (options.description !== undefined) after.description = options.description;
  if (options.flag !== undefined) after.flagged = options.flag;
  const start = parseDateFlag(options.start, ctx.today);
  if (start !== undefined) after.startDate = start;
  const due = parseDateFlag(options.due, ctx.today);
  if (due !== undefined) {
    const result = setDueDate(after, due);
    after = result.task;
    if (result.startMoved) note = `Start moved to ${result.startMoved.to}`;
  }
  return commit(ctx, snapshot, before, after, undefined, note);
}

/**
 * The status menu. Going into Waiting with `--start <date>|none` sets the hide-until date (the
 * app's Hide until picker); otherwise `changeStatus` decides, and `--start` answers its question.
 * When the hide-until date is after the due date, leaving Waiting only accepts `--start clear`.
 */
export async function setStatus(ctx: Context, ref: string, to: string, start?: string): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const before = findTask(snapshot, ref);
  return commit(ctx, snapshot, before, statusChange(before, parseStatus(to), ctx.today, start));
}

function statusChange(task: Task, to: Status, today: ISODate, start: string | undefined): Task {
  if (to === 'waiting' && start !== undefined && start !== 'keep' && start !== 'clear') {
    return waitUntil(task, parseDateFlag(start, today) ?? null);
  }
  const choice = parseStartChoice(start, today);
  if (choice !== undefined && choice !== 'clear') {
    const pending = changeStatus(task, to, today);
    if (pending.decision?.reason === 'leaving_waiting_start_after_due') {
      throw new Error(
        `"${task.title}" is hidden until ${pending.decision.startDate}, after its due date ${pending.decision.dueDate}. ` +
          `Leaving Waiting only clears the start date. Pass --start clear.`,
      );
    }
  }
  const result = changeStatus(task, to, today, choice);
  if (result.decision) throw new DecisionNeeded(task, to, result.decision);
  return result.task;
}

function presetDate(preset: Preset, date: string | undefined, today: ISODate): ISODate | null {
  const effect = preset.effect;
  if (effect.kind === 'set') return effect.date;
  if (effect.kind === 'skip') throw new Error('Skip this occurrence arrives with repeats in Phase 2');
  if (!date) throw new Error(`${preset.label} needs --date <date>`);
  const picked = resolveDate(date, today);
  if (effect.min && picked < effect.min) throw new Error(`Pick a date on or after ${effect.min}`);
  if (effect.max && picked > effect.max) throw new Error(`Pick a date on or before ${effect.max}`);
  return picked;
}

/**
 * Runs a row action by id, exactly as the app's swipe, hover and right-click menus do:
 * `<group>.<preset>` (e.g. `due.tomorrow`, `waitUntil.saturday`, `checkBack.now`, `due.pick --date 2026-12-01`)
 * or a group without presets (`moveToInProgress`, `startNow`, `markNotDone`, `restore`).
 */
export async function runAction(ctx: Context, ref: string, action: string, options: { date?: string; start?: string }): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const before = findTask(snapshot, ref);
  const actions = actionsFor(before, ctx.today);
  const [groupId, presetId] = action.split('.');
  const group = [actions.date, ...actions.state].find((g) => g?.id === groupId);
  if (!group) {
    const available = [actions.date, ...actions.state].filter(Boolean).map((g) => g!.id);
    throw new Error(`"${groupId}" isn't offered for this task (${actions.placement}); available: ${available.join(', ')}`);
  }
  if (group.presets.length === 0) {
    const effect = group.effect!;
    if (effect.kind === 'undone') return commit(ctx, snapshot, before, markNotDone(before));
    if (effect.kind === 'restore') return commit(ctx, snapshot, before, restore(before));
    return commit(ctx, snapshot, before, statusChange(before, effect.to, ctx.today, options.start));
  }
  const preset = group.presets.find((p) => p.id === presetId);
  if (!preset) throw new Error(`${group.id} presets: ${group.presets.map((p) => p.id).join(', ')}`);
  const field = preset.effect.kind === 'skip' ? 'due' : preset.effect.field;
  const date = presetDate(preset, options.date, ctx.today);
  const result = applyDateEffect(before, { kind: 'set', field, date });
  return commit(ctx, snapshot, before, result.task, undefined, result.startMoved ? `Start moved to ${result.startMoved.to}` : undefined);
}

const SECTION_STATUS: Partial<Record<Section, Status>> = { in_progress: 'in_progress', waiting: 'waiting', ready: 'open' };

export interface MoveOptions {
  before?: string;
  after?: string;
  top?: boolean;
  /** Into Upcoming (needs `start`). */
  upcoming?: boolean;
  /** Into Upcoming: removes a due date of today or earlier, which leaves no room for a later start. */
  clearDue?: boolean;
  /** The hide-until date when moving into Waiting, the answer when leaving it, or the start date when moving into Upcoming. */
  start?: string;
}

/**
 * Drag-and-drop: reorders within a section, or moves into another manual section (In Progress,
 * Waiting, Ready) next to `--before`/`--after`, changing the status like a drag does. `--upcoming`
 * is a drop into Upcoming: the task becomes Open with the `--start` date.
 */
export async function moveTask(ctx: Context, ref: string, options: MoveOptions): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const before = findTask(snapshot, ref);
  if (options.upcoming) return moveToUpcoming(ctx, snapshot, before, options);
  const anchorRef = options.before ?? options.after;
  if (!anchorRef && !options.top) throw new Error('move needs --before <task>, --after <task> or --top');
  const anchor = anchorRef ? findTask(snapshot, anchorRef) : before;
  const section = sectionFor(anchor, ctx.today);
  if (!REORDERABLE.includes(section)) throw new Error(`Tasks in ${section} can't be reordered`);

  let after = before;
  if (sectionFor(before, ctx.today) !== section) {
    if (options.top) throw new Error('--top reorders within the task\'s own section');
    after = statusChange(before, SECTION_STATUS[section]!, ctx.today, options.start);
    if (sectionFor(after, ctx.today) !== section) return commit(ctx, snapshot, before, after);
  }

  const board = buildBoard(snapshot.tasks.map((t) => (t.id === after.id ? after : t)), snapshot.positions, ctx.today);
  const list = board.sections.find((s) => s.id === section)!.tasks.filter((t) => t.id !== after.id);
  if (anchor !== before && !list.some((t) => t.id === anchor.id)) throw new Error(`"${anchor.title}" isn't in a list you can drop next to`);
  const index = options.top ? 0 : list.findIndex((t) => t.id === anchor.id) + (options.after ? 1 : 0);
  const drop = planDrop(list, snapshot.positions, after.id, index);
  return commit(ctx, snapshot, before, after, drop);
}

async function moveToUpcoming(ctx: Context, snapshot: Snapshot, before: Task, options: MoveOptions): Promise<Changed> {
  if (options.before || options.after || options.top) throw new Error('Upcoming is ordered by start date, so --upcoming takes no --before, --after or --top');
  if (sectionFor(before, ctx.today) === 'upcoming') throw new Error(`"${before.title}" is already in Upcoming`);
  const result = planUpcomingDrop(before, ctx.today, options.clearDue ? 'clear_due' : undefined);
  if (result.decision) throw new DecisionNeeded(before, 'upcoming', result.decision);
  if (!options.start) throw new Error(`--upcoming needs --start <date> (offered: ${result.presets.map((p) => p.label).join(', ')})`);
  const start = resolveDate(options.start, ctx.today);
  const min = resolveDate('+1d', ctx.today);
  const due = result.task.dueDate;
  if (start < min) throw new Error(`Pick a start date on or after ${min}`);
  if (due && start > due) throw new Error(`Pick a start date on or before the due date, ${due}`);
  return commit(ctx, snapshot, before, { ...result.task, startDate: start }, undefined, due !== before.dueDate ? 'Due date removed' : undefined);
}

export async function doneTask(ctx: Context, ref: string, on?: string): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const before = findTask(snapshot, ref);
  if (before.completedAt) throw new Error(`"${before.title}" is already completed`);
  const day = on ? resolveDate(on, ctx.today) : ctx.today;
  return commit(ctx, snapshot, before, complete(before, ctx.now, day));
}

export async function undoneTask(ctx: Context, ref: string): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const before = findTask(snapshot, ref);
  return commit(ctx, snapshot, before, markNotDone(before));
}

export async function deleteTask(ctx: Context, ref: string, forever: boolean): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const before = findTask(snapshot, ref);
  if (forever) {
    if (!before.deletedAt) throw new Error('Delete forever only works on tasks in Trash; delete it first');
    await deleteForever(ctx.scope, before.id);
    return { task: before, placement: 'deleted_forever' };
  }
  return commit(ctx, snapshot, before, softDelete(before, ctx.now, ctx.today));
}

export async function restoreTask(ctx: Context, ref: string): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const before = findTask(snapshot, ref);
  return commit(ctx, snapshot, before, restore(before));
}

export async function showTask(ctx: Context, ref: string) {
  const snapshot = await loadSnapshot(ctx.scope);
  const task = findTask(snapshot, ref);
  const actions = actionsFor(task, ctx.today);
  return {
    task,
    placement: placementFor(task, ctx.today),
    sortKey: snapshot.positions.get(task.id) ?? null,
    actions: [actions.date, ...actions.state]
      .filter((g) => g !== null)
      .map((g) => (g.presets.length ? `${g.id}: ${g.presets.map((p) => p.id).join(' ')}` : g.id))
      .concat(actions.delete.id),
  };
}

export async function search(ctx: Context, query: string, options: { completed?: boolean; flagged?: boolean }) {
  const tasks = await searchTasks(ctx.scope, query, options);
  return tasks.map((t) => changed(t, ctx.today));
}

export async function purge(ctx: Context): Promise<string[]> {
  return purgeTrash(ctx.scope, ctx.today);
}

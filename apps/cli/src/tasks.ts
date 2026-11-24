import {
  actionsFor,
  applyDateEffect,
  applyPlan,
  applySubtaskChange,
  buildBoard,
  changeStatus,
  complete,
  markNotDone,
  placementFor,
  parseTagList,
  planAddSubtask,
  planChange,
  planDeleteTag,
  planDrop,
  planEditSubtask,
  planMoveSubtask,
  planNewTask,
  planRemoveSubtask,
  planRenameTag,
  planTaskTags,
  planUpcomingDrop,
  REORDERABLE,
  resolveDate,
  restore,
  sectionFor,
  setDueDate,
  softDelete,
  sortSubtasks,
  subtaskCount,
  tagCounts,
  waitUntil,
  type ISODate,
  type PositionWrite,
  type Preset,
  type Section,
  type Status,
  type Subtask,
  type SubtaskChange,
  type SubtaskCount,
  type Tag,
  type Task,
  type UpcomingDropDecision,
} from '@app/core';
import { deleteForever, insertTask, loadSnapshot, purgeTrash, searchTasks, writeChange, writeSubtaskChange, writeTagChange, writeTaskTagChange, type Scope, type Snapshot } from '@app/data';

export interface Context {
  scope: Scope;
  today: ISODate;
  /** The timestamp written for completions and deletions. */
  now: string;
}

/**
 * Moving a task due today or earlier into Upcoming needs an answer the script didn't give: `--clear-due`
 * removes the due date, since no start date from tomorrow on fits. It's the only question left; status
 * changes never ask.
 */
export class DecisionNeeded extends Error {
  constructor(
    readonly task: Task,
    readonly to: 'upcoming',
    readonly decision: UpcomingDropDecision,
  ) {
    super(`"${task.title}" is due ${decision.dueDate}. Upcoming tasks start after today, and a start can't be after the due date (${decision.reason}). Pass --clear-due to remove the due date.`);
  }
}

export const START_ONLY_WHEN_READY = 'Start dates only apply to Ready and Upcoming tasks.';
const HIDE_UNTIL_ONLY_WAITING = 'Hide until only applies to Waiting tasks.';

export interface Changed {
  task: Task;
  placement: string;
  subtaskCount: SubtaskCount;
  /** Extra information, such as "Start moved to 2026-11-20". */
  note?: string;
}

function changed(task: Task, today: ISODate, note?: string): Changed {
  return { task, placement: placementFor(task, today), subtaskCount: subtaskCount(task.subtasks), ...(note ? { note } : {}) };
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
  hideUntil?: string;
  due?: string;
  status?: string;
  flag?: boolean;
  /** Titles of subtasks to create, in order. */
  subtasks?: string[];
  /** `--tags a,b`: names, comma separated. Tags that don't exist yet are created. */
  tags?: string;
}

function parseStatus(value: string): Status {
  const status = value === 'ready' ? 'open' : value.replace('-', '_');
  if (status !== 'open' && status !== 'in_progress' && status !== 'waiting') throw new Error(`Unknown status "${value}" (open, in_progress, waiting)`);
  return status;
}

export async function addTask(ctx: Context, title: string, options: AddOptions): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const status = options.status ? parseStatus(options.status) : 'open';
  const startDate = parseDateFlag(options.start, ctx.today) ?? null;
  const hideUntil = parseDateFlag(options.hideUntil, ctx.today) ?? null;
  if (startDate && status !== 'open') throw new Error(START_ONLY_WHEN_READY);
  if (hideUntil && status !== 'waiting') throw new Error(`${HIDE_UNTIL_ONLY_WAITING} Add it with --status waiting.`);
  const task: Task = {
    id: crypto.randomUUID(),
    title: title.trim(),
    description: options.description ?? '',
    status,
    flagged: options.flag ?? false,
    startDate,
    hideUntil,
    dueDate: parseDateFlag(options.due, ctx.today) ?? null,
  };
  for (const title of options.subtasks ?? []) {
    const change = planAddSubtask(task.subtasks, { id: crypto.randomUUID(), title });
    task.subtasks = applySubtaskChange(task.subtasks, change);
  }
  if (options.tags !== undefined) {
    const plan = planTaskTags(snapshot.tags, [], parseTagList(options.tags), () => crypto.randomUUID());
    for (const create of plan.creates) await writeTagChange(ctx.scope, create);
    task.tags = plan.tags;
  }
  const positions = planNewTask(snapshot.tasks, snapshot.positions, task, ctx.today);
  const saved = await insertTask(ctx.scope, task, positions);
  return changed(saved, ctx.today);
}

export interface EditOptions {
  title?: string;
  description?: string;
  start?: string;
  hideUntil?: string;
  due?: string;
  flag?: boolean;
  subtasks?: SubtaskEdits;
  /** `--tags a,b` sets the task's tags to exactly these (`--tags ""` clears them). Tags that don't exist yet are created. */
  tags?: string;
}

/**
 * Subtask changes for one `edit`. Each ref (a position as `show` lists them, an id prefix or a title prefix) is
 * resolved against the list as it was before the edit. Renames and ticks come first, then removals, then new
 * subtasks at the bottom, and moves last, so a move's position is where the subtask ends up in the final list.
 */
export interface SubtaskEdits {
  add?: string[];
  done?: string[];
  undone?: string[];
  remove?: string[];
  /** `ref=New title` */
  rename?: string[];
  /** `ref=position`, 1 is the top */
  move?: string[];
}

export function hasSubtaskEdits(edits: SubtaskEdits | undefined): boolean {
  return !!edits && Object.values(edits).some((list) => list && list.length > 0);
}

/** Finds a subtask by position (1 is the top), id, id prefix (at least 4 characters) or title prefix (case-insensitive). */
export function findSubtask(subtasks: readonly Subtask[], ref: string): Subtask {
  const list = sortSubtasks(subtasks);
  if (/^\d+$/.test(ref)) {
    const at = Number(ref);
    const found = list[at - 1];
    if (found) return found;
    // Four or more digits can still be the start of an id.
    if (ref.length < 4) throw new Error(list.length === 0 ? `No subtask ${at}: the task has none` : `No subtask ${at}: the task has ${list.length}`);
  }
  const needle = ref.toLowerCase();
  const byId = /^[0-9a-f-]{4,}$/.test(needle) ? list.filter((s) => s.id.startsWith(needle)) : [];
  const matches = byId.length > 0 ? byId : list.filter((s) => s.title.toLowerCase().startsWith(needle));
  if (matches.length === 1) return matches[0]!;
  const sameTitle = matches.filter((s) => s.title.toLowerCase() === needle);
  if (sameTitle.length === 1) return sameTitle[0]!;
  if (matches.length === 0) throw new Error(`No subtask matches "${ref}"`);
  throw new Error(`"${ref}" matches ${matches.length} subtasks; use its position or more of the title:\n${matches.map((s) => `  ${list.indexOf(s) + 1}. ${s.title}`).join('\n')}`);
}

function splitAssignment(value: string, flag: string, what: string): [string, string] {
  const at = value.indexOf('=');
  if (at <= 0) throw new Error(`--${flag} takes <subtask>=<${what}>`);
  return [value.slice(0, at), value.slice(at + 1)];
}

/** Turns the edits into the writes that make them, against the task's current subtasks. */
export function planSubtaskEdits(subtasks: readonly Subtask[] | undefined, edits: SubtaskEdits): SubtaskChange[] {
  const original = sortSubtasks(subtasks);
  const fields = new Map<string, { title?: string; done?: boolean }>();
  const patch = (ref: string, change: { title?: string; done?: boolean }) => {
    const id = findSubtask(original, ref).id;
    fields.set(id, { ...fields.get(id), ...change });
  };
  for (const ref of edits.done ?? []) patch(ref, { done: true });
  for (const ref of edits.undone ?? []) patch(ref, { done: false });
  for (const value of edits.rename ?? []) {
    const [ref, title] = splitAssignment(value, 'rename-subtask', 'new title');
    patch(ref, { title });
  }
  const removed = (edits.remove ?? []).map((ref) => findSubtask(original, ref).id);
  const moves = (edits.move ?? []).map((value) => {
    const [ref, position] = splitAssignment(value, 'move-subtask', 'position');
    if (!/^\d+$/.test(position) || Number(position) < 1) throw new Error(`--move-subtask position must be 1 or more, got "${position}"`);
    return { id: findSubtask(original, ref).id, to: Number(position) - 1 };
  });

  const changes: SubtaskChange[] = [];
  let working = original;
  const apply = (change: SubtaskChange | null) => {
    if (!change) return;
    changes.push(change);
    working = applySubtaskChange(working, change);
  };
  for (const [id, change] of fields) {
    if (!removed.includes(id)) apply(planEditSubtask(working, id, change));
  }
  for (const id of new Set(removed)) apply(planRemoveSubtask(working, id));
  for (const title of edits.add ?? []) apply(planAddSubtask(working, { id: crypto.randomUUID(), title }));
  for (const { id, to } of moves) {
    if (removed.includes(id)) throw new Error('A subtask can\'t be moved and removed in the same edit');
    apply(planMoveSubtask(working, id, to));
  }
  return changes;
}

/** Field edits. A due date before the start moves the start, like the app. */
export async function editTask(ctx: Context, ref: string, options: EditOptions): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const before = findTask(snapshot, ref);
  let after: Task = { ...before };
  let note: string | undefined;
  if (options.title !== undefined) after.title = options.title;
  if (options.description !== undefined) after.description = options.description;
  if (options.flag !== undefined) after.flagged = options.flag;
  const start = parseDateFlag(options.start, ctx.today);
  if (start && before.status !== 'open') throw new Error(START_ONLY_WHEN_READY);
  if (start !== undefined) after.startDate = start;
  const hideUntil = parseDateFlag(options.hideUntil, ctx.today);
  if (hideUntil && before.status !== 'waiting') {
    throw new Error(`${HIDE_UNTIL_ONLY_WAITING} Use \`status <task> waiting --hide-until <date>\` to move it to Waiting.`);
  }
  if (hideUntil !== undefined) after.hideUntil = hideUntil;
  const due = parseDateFlag(options.due, ctx.today);
  if (due !== undefined) {
    const result = setDueDate(after, due);
    after = result.task;
    if (result.startMoved) note = `Start moved to ${result.startMoved.to}`;
  }
  const subtaskChanges = hasSubtaskEdits(options.subtasks) ? planSubtaskEdits(before.subtasks, options.subtasks!) : [];
  if (subtaskChanges.length > 0 && before.deletedAt) throw new Error('Subtasks of a task in Trash can\'t be changed; restore it first');
  const tagPlan = options.tags === undefined ? null : planTaskTags(snapshot.tags, before.tags, parseTagList(options.tags), () => crypto.randomUUID());
  if (tagPlan && before.deletedAt && (tagPlan.attach.length > 0 || tagPlan.detach.length > 0)) throw new Error('Tags of a task in Trash can\'t be changed; restore it first');
  const result = await commit(ctx, snapshot, before, after, undefined, note);
  if (subtaskChanges.length === 0 && !tagPlan) return result;
  for (const change of subtaskChanges) await writeSubtaskChange(ctx.scope, before.id, change);
  if (tagPlan) {
    for (const create of tagPlan.creates) await writeTagChange(ctx.scope, create);
    for (const tagId of tagPlan.detach) await writeTaskTagChange(ctx.scope, before.id, { kind: 'detach', tagId });
    for (const tag of tagPlan.attach) await writeTaskTagChange(ctx.scope, before.id, { kind: 'attach', tag });
  }
  const next = {
    ...result.task,
    ...(subtaskChanges.length > 0 ? { subtasks: subtaskChanges.reduce((list, change) => applySubtaskChange(list, change), sortSubtasks(before.subtasks)) } : {}),
    ...(tagPlan ? { tags: tagPlan.tags } : {}),
  };
  Object.assign(snapshot, { tasks: snapshot.tasks.map((t) => (t.id === next.id ? next : t)) });
  return changed(next, ctx.today, note);
}

/**
 * The status menu. Going into Waiting, `--hide-until <date>|none` is the Hide until picker's answer
 * (none, or leaving it out, is Don't hide). Status changes never ask and never touch dates beyond what
 * `changeStatus` clears.
 */
export async function setStatus(ctx: Context, ref: string, to: string, options: { start?: string; hideUntil?: string } = {}): Promise<Changed> {
  const snapshot = await loadSnapshot(ctx.scope);
  const before = findTask(snapshot, ref);
  return commit(ctx, snapshot, before, statusChange(before, parseStatus(to), ctx.today, options));
}

/** Why `--start` can't go with a status change. The old `--start clear|keep|<date>` answers are gone. */
function rejectStart(to: Status, start: string): never {
  if (to === 'waiting') throw new Error(`Waiting tasks have no start date. Use --hide-until <date>|none for Hide until (not --start ${start}).`);
  if (start === 'clear' || start === 'keep') {
    throw new Error(`--start ${start} no longer exists: status changes clear the dates that no longer apply on their own. Waiting's date is --hide-until <date>|none.`);
  }
  if (to === 'in_progress') throw new Error(START_ONLY_WHEN_READY);
  throw new Error('Status changes take no --start. Set a start date with `edit <task> --start <date>`, or drop into Upcoming with `move <task> --upcoming --start <date>`.');
}

function statusChange(task: Task, to: Status, today: ISODate, options: { start?: string; hideUntil?: string }): Task {
  if (options.start !== undefined) rejectStart(to, options.start);
  if (options.hideUntil !== undefined && to !== 'waiting') throw new Error(`${HIDE_UNTIL_ONLY_WAITING} It's cleared when a task leaves Waiting.`);
  if (to === 'waiting') {
    if (options.hideUntil !== undefined) return waitUntil(task, parseDateFlag(options.hideUntil, today) ?? null);
    return task.status === 'waiting' ? task : waitUntil(task, null);
  }
  return changeStatus(task, to);
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
 * `<group>.<preset>` (e.g. `due.tomorrow`, `extendWait.saturday`, `checkBack.now`, `due.pick --date 2026-12-01`)
 * or a group without presets (`moveToWaiting`, `moveToInProgress`, `startNow`, `markNotDone`, `restore`).
 * `moveToWaiting` takes the Hide until picker's answer as `--hide-until <date>|none`.
 */
export async function runAction(ctx: Context, ref: string, action: string, options: { date?: string; start?: string; hideUntil?: string }): Promise<Changed> {
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
    return commit(ctx, snapshot, before, statusChange(before, effect.to, ctx.today, options));
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
  /** The start date when moving into Upcoming. */
  start?: string;
  /** The hide-until date when moving into Waiting; none or omitted is Don't hide. */
  hideUntil?: string;
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
    after = statusChange(before, SECTION_STATUS[section]!, ctx.today, { start: options.start, hideUntil: options.hideUntil });
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
    return { task: before, placement: 'deleted_forever', subtaskCount: subtaskCount(before.subtasks) };
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
    subtaskCount: subtaskCount(task.subtasks),
    actions: [actions.date, ...actions.state]
      .filter((g) => g !== null)
      .map((g) => (g.presets.length ? `${g.id}: ${g.presets.map((p) => p.id).join(' ')}` : g.id))
      .concat(actions.delete.id),
  };
}

/** Finds a tag by name (ignoring case), id or id prefix (at least 4 characters). */
export function findTag(tags: readonly Tag[], ref: string): Tag {
  const key = ref.trim().toLowerCase();
  const byName = tags.filter((t) => t.name.toLowerCase() === key);
  if (byName.length === 1) return byName[0]!;
  const byId = tags.filter((t) => t.id === key || (key.length >= 4 && /^[0-9a-f-]+$/.test(key) && t.id.startsWith(key)));
  if (byId.length === 1) return byId[0]!;
  if (byId.length > 1) throw new Error(`"${ref}" matches ${byId.length} tags; use more of the id`);
  throw new Error(`No tag named "${ref}"${tags.length ? ` (tags: ${tags.map((t) => t.name).join(', ')})` : ''}`);
}

export async function search(ctx: Context, query: string, options: { completed?: boolean; flagged?: boolean; tags?: string[] }) {
  const tagIds = options.tags?.length ? findTags(await loadSnapshot(ctx.scope), options.tags) : [];
  const tasks = await searchTasks(ctx.scope, query, { completed: options.completed, flagged: options.flagged, tagIds });
  return tasks.map((t) => changed(t, ctx.today));
}

function findTags(snapshot: Snapshot, refs: readonly string[]): string[] {
  return refs.map((ref) => findTag(snapshot.tags, ref).id);
}

export interface TagListing {
  id: string;
  name: string;
  count: number;
}

/** Every tag with how many tasks still to do have it (not completed, not in Trash). */
export async function listTags(ctx: Context): Promise<TagListing[]> {
  const snapshot = await loadSnapshot(ctx.scope);
  return tagCounts(snapshot.tasks, snapshot.tags).map(({ tag, count }) => ({ id: tag.id, name: tag.name, count }));
}

/** Renames a tag on every task at once. Fails if the new name is taken by another tag (ignoring case). */
export async function renameTag(ctx: Context, ref: string, name: string): Promise<{ tag: Tag; from: string }> {
  const snapshot = await loadSnapshot(ctx.scope);
  const tag = findTag(snapshot.tags, ref);
  const change = planRenameTag(snapshot.tags, tag.id, name);
  if (change) await writeTagChange(ctx.scope, change);
  return { tag: change?.kind === 'rename' ? { id: tag.id, name: change.name } : tag, from: tag.name };
}

/** Deletes a tag and removes it from every task. The tasks stay. */
export async function deleteTag(ctx: Context, ref: string): Promise<{ tag: Tag; tasks: number }> {
  const snapshot = await loadSnapshot(ctx.scope);
  const tag = findTag(snapshot.tags, ref);
  await writeTagChange(ctx.scope, planDeleteTag(snapshot.tags, tag.id));
  return { tag, tasks: snapshot.tasks.filter((t) => t.tags?.some((g) => g.id === tag.id)).length };
}

export async function purge(ctx: Context): Promise<string[]> {
  return purgeTrash(ctx.scope, ctx.today);
}

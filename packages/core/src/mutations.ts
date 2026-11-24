import { upcomingDropPresets, type Preset, type PresetEffect } from './actions.ts';
import { addDays } from './dates.ts';
import { DEFAULT_POLICY, type Policy } from './policy.ts';
import { sectionFor } from './sections.ts';
import { newSortKey } from './sort-keys.ts';
import { setDueDate, waitUntil, type DueDateChange } from './transitions.ts';
import type { ISODate, Section, Task } from './types.ts';
import { sameRepeat } from './repeat.ts';
import { validateTask } from './validate.ts';

/** The fields a client may write. Everything else is set by the database or derived. */
export const EDITABLE_FIELDS = ['title', 'description', 'status', 'flagged', 'startDate', 'hideUntil', 'dueDate', 'repeat', 'completedAt', 'completedOn', 'deletedAt', 'deletedOn'] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type TaskPatch = Partial<Pick<Task, EditableField>>;

/** Only the fields that changed, so edits to different fields on two devices both survive. */
export function taskPatch(before: Task, after: Task): TaskPatch {
  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    const a = before[field] ?? null;
    const b = after[field] ?? null;
    if (field === 'repeat' ? !sameRepeat(before.repeat, after.repeat) : a !== b) patch[field] = b;
  }
  return patch as TaskPatch;
}

/** Throws with every issue when a task can't be written. */
export function assertValid(task: Partial<Task>): void {
  const issues = validateTask(task);
  if (issues.length > 0) throw new Error(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
}

/** Completes a non-recurring task. The status, dates and position stay, so Mark not done puts it back. */
export function complete<T extends Task>(task: T, now: string, on: ISODate): T {
  return { ...task, completedAt: now, completedOn: on };
}

export function markNotDone<T extends Task>(task: T): T {
  return { ...task, completedAt: null, completedOn: null };
}

export function softDelete<T extends Task>(task: T, now: string, on: ISODate): T {
  return { ...task, deletedAt: now, deletedOn: on };
}

export function restore<T extends Task>(task: T): T {
  return { ...task, deletedAt: null, deletedOn: null };
}

/** Trash keeps a task for 30 days after its deletion day: deleted 30 days ago stays, 31 goes. */
export function shouldPurge(task: Task, today: ISODate): boolean {
  return !!task.deletedOn && task.deletedOn < addDays(today, -30);
}

/**
 * Applies a date preset. Due dates keep start <= due (see `setDueDate`); hide-until picks make the
 * task Waiting. A start date after the due date, or on a task that isn't Open, is refused (pickers
 * and presets never offer one).
 */
export function applyDateEffect<T extends Task>(task: T, effect: Extract<PresetEffect, { kind: 'set' }>, policy: Policy = DEFAULT_POLICY): DueDateChange<T> {
  switch (effect.field) {
    case 'due':
      return setDueDate(task, effect.date, policy);
    case 'hideUntil':
      return { task: waitUntil(task, effect.date) };
    case 'start': {
      const next = { ...task, startDate: effect.date };
      assertValid(next);
      return { task: next };
    }
  }
}

/** What a change does to the task's stored board position. `top` means the top of its new section. */
export type PositionEffect = 'keep' | 'clear' | 'top';

/**
 * The transition table's position column. A future start date clears the position
 * (Upcoming sorts by start date, and the task arrives at the bottom of Ready). A status change puts
 * the task at the top of its new section. Completing, deleting, restoring and editing keep it.
 * Drag-and-drop doesn't use this: the task goes where it was dropped (see `planDrop`).
 */
export function positionEffect(before: Task, after: Task, today: ISODate): PositionEffect {
  if (after.completedAt || after.deletedAt || before.completedAt || before.deletedAt) return 'keep';
  if (sectionFor(after, today) === 'upcoming') return 'clear';
  if (before.status !== after.status) return 'top';
  return 'keep';
}

/** A key above every positioned task in `section`. */
export function topKeyFor(section: readonly { id: string }[], positions: ReadonlyMap<string, string>, random?: () => number): string {
  let first: string | null = null;
  for (const t of section) {
    const key = positions.get(t.id);
    if (key !== undefined && (first === null || key < first)) first = key;
  }
  return newSortKey(null, first, random);
}

export interface PositionWrite {
  taskId: string;
  sortKey: string;
}

/**
 * Where a dragged task lands: `order` is the target section as shown, without the moving task, and
 * `index` is where it's dropped. Writes the moving task's key, plus keys for any unpositioned tasks
 * above the drop point (they sort below every positioned task, so they need one to stay above it).
 */
export function planDrop(
  order: readonly { id: string }[],
  positions: ReadonlyMap<string, string>,
  movingId: string,
  index: number,
  newKey: (a: string | null, b: string | null) => string = (a, b) => newSortKey(a, b),
): PositionWrite[] {
  const at = Math.max(0, Math.min(index, order.length));
  const writes: PositionWrite[] = [];
  let previous: string | null = null;
  for (let i = 0; i < at; i++) {
    const id = order[i]!.id;
    const key = positions.get(id);
    if (key !== undefined) {
      previous = key;
    } else {
      previous = newKey(previous, null);
      writes.push({ taskId: id, sortKey: previous });
    }
  }
  const nextTask = order[at];
  let next = nextTask ? (positions.get(nextTask.id) ?? null) : null;
  // Two devices can write the same key; the tie breaks by id, so there's no room between them.
  if (previous !== null && next !== null && previous >= next) next = null;
  writes.push({ taskId: movingId, sortKey: newKey(previous, next) });
  return writes;
}

/** Why a drop into Upcoming needs an answer first. Not choosing (Cancel) leaves the task where it was. */
export interface UpcomingDropDecision {
  /** Due today or earlier, so no start date from tomorrow on fits. */
  reason: 'due_today_or_earlier';
  dueDate: ISODate;
  options: UpcomingDropChoice[];
}

export type UpcomingDropChoice = 'clear_due';

/** The task as it enters Upcoming (Open, hide-until cleared, before its start date is set) and the start dates on offer. */
export type UpcomingDrop<T extends Task> = { task: T; presets: Preset[]; decision?: never } | { task?: never; presets?: never; decision: UpcomingDropDecision };

/**
 * A drop into Upcoming, which has no manual order (so no `planDrop` positions). Returns `decision`
 * when the due date is today or earlier, which leaves no room for a later start; call again with `choice`.
 * A `choice` given when no decision is needed is ignored.
 */
export function planUpcomingDrop<T extends Task>(task: T, today: ISODate, choice?: UpcomingDropChoice): UpcomingDrop<T> {
  let next: T = { ...task, status: 'open', hideUntil: null };
  if (task.dueDate && task.dueDate <= today) {
    if (choice !== 'clear_due') return { decision: { reason: 'due_today_or_earlier', dueDate: task.dueDate, options: ['clear_due'] } };
    next = { ...next, dueDate: null };
  }
  return { task: next, presets: upcomingDropPresets(next, today) };
}

/** Everything one change writes: the changed task fields and the board-position rows. */
export interface ChangePlan {
  patch: TaskPatch;
  positions: PositionWrite[];
  clearPosition: boolean;
}

/**
 * Plans one change from `before` to `after` against the current tasks and positions. `drop` is a
 * drag-and-drop placement from `planDrop`, which wins over the transition table.
 */
export function planChange(
  tasks: readonly Task[],
  positions: ReadonlyMap<string, string>,
  before: Task,
  after: Task,
  today: ISODate,
  drop?: PositionWrite[],
): ChangePlan {
  assertValid(after);
  const patch = taskPatch(before, after);
  if (drop) return { patch, positions: drop, clearPosition: false };
  const effect = positionEffect(before, after, today);
  if (effect === 'clear') return { patch, positions: [], clearPosition: positions.has(after.id) };
  if (effect === 'keep') return { patch, positions: [], clearPosition: false };
  const section = sectionFor(after, today);
  const peers = tasks.filter((t) => t.id !== after.id && sectionFor(t, today) === section);
  return { patch, positions: [{ taskId: after.id, sortKey: topKeyFor(peers, positions) }], clearPosition: false };
}

/** A new task goes to the top of its section, or has no position if it starts in the future. */
export function planNewTask(tasks: readonly Task[], positions: ReadonlyMap<string, string>, task: Task, today: ISODate): PositionWrite[] {
  assertValid(task);
  const section = sectionFor(task, today);
  if (section === 'upcoming' || section === 'completed' || section === 'trash') return [];
  const peers = tasks.filter((t) => sectionFor(t, today) === section);
  return [{ taskId: task.id, sortKey: topKeyFor(peers, positions) }];
}

/** Applies a plan to an in-memory copy, for optimistic updates. */
export function applyPlan<T extends Task>(tasks: readonly T[], positions: ReadonlyMap<string, string>, after: T, plan: ChangePlan): { tasks: T[]; positions: Map<string, string> } {
  const next = new Map(positions);
  if (plan.clearPosition) next.delete(after.id);
  for (const w of plan.positions) next.set(w.taskId, w.sortKey);
  return { tasks: tasks.map((t) => (t.id === after.id ? after : t)), positions: next };
}

/** Sections whose order is manual, so drag-and-drop can reorder them. */
export const REORDERABLE: readonly Section[] = ['in_progress', 'waiting', 'ready'];

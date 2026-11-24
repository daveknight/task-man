import { compareSortKeys, newSortKey } from './sort-keys.ts';
import type { Subtask } from './types.ts';

/** Generates a key strictly between two neighbours. Tests pass `keyBetween` to make it deterministic. */
export type NewKey = (a: string | null, b: string | null) => string;

const defaultNewKey: NewKey = (a, b) => newSortKey(a, b);

/** Subtasks in their order: sort key, then id, so two devices that wrote the same key still agree. */
export function sortSubtasks(subtasks: readonly Subtask[] | undefined): Subtask[] {
  return [...(subtasks ?? [])].sort((a, b) => compareSortKeys(a.sortKey, b.sortKey) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface SubtaskCount {
  done: number;
  total: number;
}

/** The progress shown on a row ("2/4") and in the sheet ("2 of 4"). */
export function subtaskCount(subtasks: readonly Subtask[] | undefined): SubtaskCount {
  const list = subtasks ?? [];
  return { done: list.filter((s) => s.done).length, total: list.length };
}

/** A subtask title as stored: trimmed, and never empty. Returns null for a title that is only whitespace. */
export function normalizeSubtaskTitle(title: string): string | null {
  const trimmed = title.trim();
  return trimmed === '' ? null : trimmed;
}

function requireTitle(title: string): string {
  const normalized = normalizeSubtaskTitle(title);
  if (normalized === null) throw new Error('Subtask title is required');
  return normalized;
}

/** One write to a task's subtasks. Each is a single row operation, so edits on two devices merge. */
export type SubtaskChange =
  | { kind: 'add'; subtask: Subtask }
  | { kind: 'edit'; id: string; patch: { title?: string; done?: boolean } }
  | { kind: 'move'; id: string; sortKey: string }
  | { kind: 'remove'; id: string };

function find(subtasks: readonly Subtask[], id: string): Subtask {
  const found = subtasks.find((s) => s.id === id);
  if (!found) throw new Error(`No subtask ${id}`);
  return found;
}

/** The list after one change, in order. Doesn't modify its input. */
export function applySubtaskChange(subtasks: readonly Subtask[] | undefined, change: SubtaskChange): Subtask[] {
  const list = subtasks ?? [];
  switch (change.kind) {
    case 'add':
      return sortSubtasks([...list, change.subtask]);
    case 'edit':
      return sortSubtasks(list.map((s) => (s.id === change.id ? { ...s, ...change.patch } : s)));
    case 'move':
      return sortSubtasks(list.map((s) => (s.id === change.id ? { ...s, sortKey: change.sortKey } : s)));
    case 'remove':
      return list.filter((s) => s.id !== change.id);
  }
}

/** A new subtask goes at the bottom of the list. */
export function planAddSubtask(subtasks: readonly Subtask[] | undefined, input: { id: string; title: string }, newKey: NewKey = defaultNewKey): SubtaskChange {
  const list = sortSubtasks(subtasks);
  if (list.some((s) => s.id === input.id)) throw new Error(`Subtask ${input.id} already exists`);
  const title = requireTitle(input.title);
  const last = list.at(-1)?.sortKey ?? null;
  return { kind: 'add', subtask: { id: input.id, title, done: false, sortKey: newKey(last, null) } };
}

/** Renames and ticks. Returns null when nothing would change. */
export function planEditSubtask(subtasks: readonly Subtask[] | undefined, id: string, fields: { title?: string; done?: boolean }): SubtaskChange | null {
  const current = find(subtasks ?? [], id);
  const patch: { title?: string; done?: boolean } = {};
  if (fields.title !== undefined) {
    const title = requireTitle(fields.title);
    if (title !== current.title) patch.title = title;
  }
  if (fields.done !== undefined && fields.done !== current.done) patch.done = fields.done;
  return Object.keys(patch).length === 0 ? null : { kind: 'edit', id, patch };
}

export function planRemoveSubtask(subtasks: readonly Subtask[] | undefined, id: string): SubtaskChange {
  find(subtasks ?? [], id);
  return { kind: 'remove', id };
}

/**
 * Moves a subtask so it ends up at `toIndex` in the list (0 is the top; past the end means the bottom).
 * Only the moved subtask is written. Returns null when it's already there.
 */
export function planMoveSubtask(subtasks: readonly Subtask[] | undefined, id: string, toIndex: number, newKey: NewKey = defaultNewKey): SubtaskChange | null {
  const list = sortSubtasks(subtasks);
  const from = list.findIndex((s) => s.id === id);
  if (from === -1) throw new Error(`No subtask ${id}`);
  const others = list.filter((s) => s.id !== id);
  const at = Math.max(0, Math.min(Math.trunc(toIndex), others.length));
  if (at === from) return null;
  const previous = others[at - 1]?.sortKey ?? null;
  let next = others[at]?.sortKey ?? null;
  // Two devices can write the same key, which leaves no room between them.
  if (previous !== null && next !== null && previous >= next) next = null;
  return { kind: 'move', id, sortKey: newKey(previous, next) };
}

/** Every subtask not done again, as a recurring task needs for its next occurrence. */
export function resetSubtasks(subtasks: readonly Subtask[] | undefined): Subtask[] {
  return sortSubtasks(subtasks).map((s) => (s.done ? { ...s, done: false } : s));
}

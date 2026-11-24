import type { Section, Task } from '@app/core';
import { useSyncExternalStore } from 'react';

/** Small external stores for list feedback that outlives a render: live title text, rows leaving, the row just dropped. */
function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const liveTitle = store<{ id: string; text: string } | null>(null);

/** The title being typed in a list row, so the detail pane can follow it. */
export function setLiveTitle(next: { id: string; text: string } | null) {
  liveTitle.set(next);
}

/** The text being typed into the list row for this task, or null when it isn't being edited there. */
export function useLiveTitle(id: string): string | null {
  const live = useSyncExternalStore(liveTitle.subscribe, liveTitle.get);
  return live?.id === id ? live.text : null;
}

/** Matches the fold motion's duration. */
export const LEAVE_MS = 200;

const leaving = store<ReadonlySet<string>>(new Set());

export function useLeavingIds(): ReadonlySet<string> {
  return useSyncExternalStore(leaving.subscribe, leaving.get);
}

export function useLeaving(id: string): boolean {
  return useSyncExternalStore(leaving.subscribe, () => leaving.get().has(id));
}

/**
 * Lets a row slide out of the list, then runs the change that removes it. With reduced motion the
 * change runs at once. The row is released afterwards, so an Undo shows it again normally.
 */
export async function leaveThen(id: string, change: () => Promise<unknown> | void): Promise<void> {
  if (navigator.onLine && !prefersReducedMotion()) {
    leaving.set(new Set(leaving.get()).add(id));
    await new Promise((resolve) => setTimeout(resolve, LEAVE_MS));
  }
  try {
    await change();
  } finally {
    const next = new Set(leaving.get());
    next.delete(id);
    leaving.set(next);
  }
}

/** How long a checked-off (or unchecked) row stays in its old place, struck through or not, before it folds away. */
export const MOVE_HOLD_MS = 500;

export type MoveSource = Section | 'waiting_later';

/**
 * A task that just changed between open and completed. The data has already changed (the write is never
 * held back); this is only how the list shows it. Its new state stays in the list it left (the "ghost")
 * during `hold`, then folds away during `leave` while the row grows into its new list.
 */
export interface Move {
  /** The task after the change, which is what the ghost shows. */
  after: Task;
  /** The list the task left, and its place in it. */
  from: MoveSource;
  index: number;
  phase: 'hold' | 'leave';
}

const moves = store<ReadonlyMap<string, Move>>(new Map());
const moveTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

function setMove(id: string, move: Move | null) {
  const next = new Map(moves.get());
  if (move) next.set(id, move);
  else next.delete(id);
  moves.set(next);
}

/** Drops a move at once (a rapid toggle, or a write that failed), leaving the list as the data says. */
export function cancelMove(id: string) {
  moveTimers.get(id)?.forEach(clearTimeout);
  moveTimers.delete(id);
  if (moves.get().has(id)) setMove(id, null);
}

/** Skipped with reduced motion and offline, where the list should just show the data. */
export function canAnimateMoves(): boolean {
  return navigator.onLine && !prefersReducedMotion();
}

export function startMove(move: Omit<Move, 'phase'>) {
  const id = move.after.id;
  cancelMove(id);
  setMove(id, { ...move, phase: 'hold' });
  moveTimers.set(id, [
    setTimeout(() => setMove(id, { ...move, phase: 'leave' }), MOVE_HOLD_MS),
    setTimeout(() => cancelMove(id), MOVE_HOLD_MS + LEAVE_MS + 50),
  ]);
}

export function hasMove(id: string): boolean {
  return moves.get().has(id);
}

export function useMoves(): ReadonlyMap<string, Move> {
  return useSyncExternalStore(moves.subscribe, moves.get);
}

/** A very short buzz when a task is checked off. Browsers without the Vibration API (iOS Safari) skip it. */
export function pulse() {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
}

/** How long a dropped row stays highlighted before it fades. */
export const DROP_HIGHLIGHT_MS = 2000;

const dropped = store<string | null>(null);
let droppedTimer: ReturnType<typeof setTimeout> | undefined;

/** Highlights the row just placed by a drag, for two seconds. */
export function flashDropped(id: string) {
  clearTimeout(droppedTimer);
  dropped.set(id);
  droppedTimer = setTimeout(() => dropped.set(null), DROP_HIGHLIGHT_MS);
}

export function useDropped(id: string): boolean {
  return useSyncExternalStore(dropped.subscribe, () => dropped.get() === id);
}

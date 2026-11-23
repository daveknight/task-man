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

import { sectionFor, waitingStateFor } from './sections.ts';
import { compareSortKeys } from './sort-keys.ts';
import type { ISODate, Section, Task } from './types.ts';

export interface BoardOptions {
  /** Adds the Completed section ("Show completed"). */
  showCompleted?: boolean;
  /** Adds Trash, which the app shows on its own screen. */
  showTrash?: boolean;
}

export interface BoardSection<T extends Task = Task> {
  id: Section;
  /** Collapsed unless the user last left it expanded. */
  collapsedByDefault: boolean;
  /** Waiting: the tasks needing follow-up. Other sections: every task. */
  tasks: T[];
  /** Waiting only: tasks behind the "Show N waiting until later" row, soonest check-back first. */
  later?: T[];
  /** Everything in the section, including `later`. */
  count: number;
}

export interface Board<T extends Task = Task> {
  today: ISODate;
  sections: BoardSection<T>[];
}

/** Sort keys for one view, by task id. */
export type Positions = ReadonlyMap<string, string> | Readonly<Record<string, string>>;

function positionOf(positions: Positions, id: string): string | undefined {
  return positions instanceof Map ? positions.get(id) : (positions as Record<string, string>)[id];
}

function compareStrings(a: string | null | undefined, b: string | null | undefined): number {
  const x = a ?? '';
  const y = b ?? '';
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Empty values sort last. */
function compareOptionalAsc(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return compareStrings(a, b);
}

/** The order every device agrees on for tasks with no stored position. */
function compareUnpositioned(a: Task, b: Task): number {
  return (
    compareOptionalAsc(a.startDate, b.startDate) ||
    compareStrings(a.createdAt, b.createdAt) ||
    compareStrings(a.id, b.id)
  );
}

/** Positioned tasks by sort key (task id breaks ties), then unpositioned ones below. */
function manualOrder(positions: Positions) {
  return (a: Task, b: Task): number => {
    const ka = positionOf(positions, a.id);
    const kb = positionOf(positions, b.id);
    if (ka !== undefined && kb !== undefined) return compareSortKeys(ka, kb) || compareStrings(a.id, b.id);
    if (ka !== undefined) return -1;
    if (kb !== undefined) return 1;
    return compareUnpositioned(a, b);
  };
}

const byStartDate = (a: Task, b: Task) =>
  compareOptionalAsc(a.startDate, b.startDate) || compareStrings(a.createdAt, b.createdAt) || compareStrings(a.id, b.id);

const byNewest = (field: 'completedAt' | 'deletedAt') => (a: Task, b: Task) =>
  compareStrings(b[field], a[field]) || compareStrings(a.id, b.id);

/** Groups and orders tasks exactly as the board shows them. */
export function buildBoard<T extends Task>(
  tasks: readonly T[],
  positions: Positions,
  today: ISODate,
  options: BoardOptions = {},
): Board<T> {
  const groups: Record<Section, T[]> = {
    in_progress: [],
    waiting: [],
    ready: [],
    upcoming: [],
    completed: [],
    trash: [],
  };
  for (const task of tasks) groups[sectionFor(task, today)].push(task);

  const manual = manualOrder(positions);
  const needsFollowUp = groups.waiting.filter((t) => waitingStateFor(t, today) === 'needs_follow_up').sort(manual);
  const later = groups.waiting
    .filter((t) => waitingStateFor(t, today) === 'later')
    .sort((a, b) => compareStrings(a.waitUntil, b.waitUntil) || manual(a, b));

  const sections: BoardSection<T>[] = [
    { id: 'in_progress', collapsedByDefault: false, tasks: groups.in_progress.sort(manual), count: groups.in_progress.length },
    { id: 'waiting', collapsedByDefault: false, tasks: needsFollowUp, later, count: groups.waiting.length },
    { id: 'ready', collapsedByDefault: false, tasks: groups.ready.sort(manual), count: groups.ready.length },
    { id: 'upcoming', collapsedByDefault: true, tasks: groups.upcoming.sort(byStartDate), count: groups.upcoming.length },
  ];
  if (options.showCompleted) {
    sections.push({
      id: 'completed',
      collapsedByDefault: true,
      tasks: groups.completed.sort(byNewest('completedAt')),
      count: groups.completed.length,
    });
  }
  if (options.showTrash) {
    sections.push({
      id: 'trash',
      collapsedByDefault: false,
      tasks: groups.trash.sort(byNewest('deletedAt')),
      count: groups.trash.length,
    });
  }
  return { today, sections };
}

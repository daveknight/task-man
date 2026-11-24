/** A calendar day, `YYYY-MM-DD`, with no time or time zone. */
export type ISODate = string;

/** A checklist item that exists only inside its parent task. */
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  /** Orders the subtasks within their task; compare byte-wise (see `compareSortKeys`). */
  sortKey: string;
}

/** A label on tasks. Many tasks share one tag, and a task can have many. */
export interface Tag {
  id: string;
  name: string;
}

export type Status = 'open' | 'in_progress' | 'waiting';

export const STATUSES: readonly Status[] = ['open', 'in_progress', 'waiting'];

/** The fields the rules read. Mirrors public.tasks in camelCase. */
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: Status;
  flagged?: boolean;
  /** The day an Open task becomes ready. Only Open tasks have one; a future start puts the task in Upcoming. */
  startDate?: ISODate | null;
  /** Waiting's own date: the task is hidden until later until this day. Only Waiting tasks have one, and it may fall after the due date. */
  hideUntil?: ISODate | null;
  dueDate?: ISODate | null;
  completedAt?: string | null;
  completedOn?: ISODate | null;
  deletedAt?: string | null;
  deletedOn?: ISODate | null;
  createdAt?: string;
  /** Loaded alongside the task. Not part of a task patch: subtasks are written one at a time. */
  subtasks?: Subtask[];
  /** Loaded alongside the task, in the order they were added (see `orderTaskTags`). Not part of a task patch: tags are written one link at a time. */
  tags?: Tag[];
}

export type Section = 'in_progress' | 'waiting' | 'ready' | 'upcoming' | 'completed' | 'trash';

export type WaitingState = 'needs_follow_up' | 'later';

/** Section plus the Waiting sub-state, flattened; the vocabulary of seed/tasks.json `expect`. */
export type Placement = Exclude<Section, 'waiting'> | 'waiting' | 'waiting_later';

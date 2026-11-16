/** A calendar day, `YYYY-MM-DD`, with no time or time zone. */
export type ISODate = string;

export type Status = 'open' | 'in_progress' | 'waiting';

export const STATUSES: readonly Status[] = ['open', 'in_progress', 'waiting'];

/** The fields the rules read. Mirrors public.tasks in camelCase. */
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: Status;
  waitUntil?: ISODate | null;
  flagged?: boolean;
  startDate?: ISODate | null;
  dueDate?: ISODate | null;
  completedAt?: string | null;
  completedOn?: ISODate | null;
  deletedAt?: string | null;
  deletedOn?: ISODate | null;
  createdAt?: string;
}

export type Section = 'in_progress' | 'waiting' | 'ready' | 'upcoming' | 'completed' | 'trash';

export type WaitingState = 'needs_follow_up' | 'later';

/** Section plus the Waiting sub-state, flattened; the vocabulary of seed/tasks.json `expect`. */
export type Placement = Exclude<Section, 'waiting'> | 'waiting' | 'waiting_later';

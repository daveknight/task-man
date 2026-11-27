import { localDate } from './dates.ts';
import { repeatLabel } from './repeat-label.ts';
import { planOccurrence, planUndoOccurrence, type OccurrenceRecord } from './repeat.ts';
import { sectionFor } from './sections.ts';
import type { ISODate, RepeatRule, Section, Status, Task } from './types.ts';

/** What one recorded occurrence left behind. Replayed from its snapshot, so a later edit doesn't rewrite it. */
export interface TaskHistoryEffect {
  /** `advance` keeps the series going. `end` finishes it for good. */
  outcome: 'advance' | 'end';
  status: Status;
  dueDate: ISODate | null;
  startDate: ISODate | null;
  hideUntil: ISODate | null;
  /** Set only when this occurrence finished the series. */
  completedOn: ISODate | null;
}

/** The section names the board already uses. `trash` is the Recently deleted section. */
const SECTION_LABEL: Record<Section, string> = {
  in_progress: 'In Progress',
  waiting: 'Waiting',
  ready: 'Ready',
  upcoming: 'Upcoming',
  completed: 'Completed',
  trash: 'Recently deleted',
};

/** History times are shown in Pacific, matching the product's day. */
export const HISTORY_ZONE = 'America/Los_Angeles';

const ARROW = ' → ';
const SNIPPET = 80;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * One stored field change. `before` and `after` are the raw values. A status, completed or deleted
 * value is the section context (status, start, completed, deleted), not the display name.
 * Rows that share a `batchId` were one save. `seq` is their order inside that save.
 */
export interface ActivityRecord {
  id: string;
  userId: string;
  taskId: string;
  batchId: string;
  seq: number;
  at: string;
  kind: 'created' | 'changed';
  field: string;
  before: unknown;
  after: unknown;
}

interface HistoryBase {
  id: string;
  taskId: string;
  at: string;
}

/** One completion or skip. Oldest first when listed alone, and undo stays on the latest of these only. */
export interface OccurrenceHistoryEntry extends HistoryBase {
  action: 'completed' | 'skipped';
  /** Stored kind. `done` finished that occurrence; `skip` moved past it. */
  kind: 'done' | 'skip';
  /** The word the history view shows. */
  label: 'Done' | 'Skipped';
  /** The occurrence's due date. A task can record each due date only once. */
  occurrenceDue: ISODate;
  /** The local day the completion or skip was recorded. */
  completedOn: ISODate;
  completedAt: string;
  effect: TaskHistoryEffect;
  /** The latest occurrence, and only while the task still matches what that occurrence left. */
  undoable: boolean;
}

/** One field change. `verb` and `detail` are the short card text; `before` and `after` stay complete. */
export interface FieldHistoryEntry extends HistoryBase {
  action: 'created' | 'changed';
  userId: string;
  batchId: string;
  seq: number;
  field: string;
  before: unknown;
  after: unknown;
  /** Without the actor: "changed the title", "moved the task", "created the task". */
  verb: string;
  /** A short value. An arrow joins before and after when both exist. */
  detail: string;
}

/** One row of a task's timeline, oldest first. Completions and skips are unioned with field changes. */
export type TaskHistoryEntry = OccurrenceHistoryEntry | FieldHistoryEntry;

export function isOccurrenceHistory(entry: TaskHistoryEntry): entry is OccurrenceHistoryEntry {
  return entry.action === 'completed' || entry.action === 'skipped';
}

/** One card. Field rows that share a batch are one card; each occurrence is its own. Oldest first. */
export interface HistoryCard {
  id: string;
  at: string;
  verb: string;
  lines: { detail: string }[];
  undoable: boolean;
  /** Set when the card is a completion or a skip. */
  occurrence: OccurrenceHistoryEntry | null;
  /** Set when the card is a single field. */
  field: string | null;
}

const LINE_LABEL: Record<string, string> = {
  title: 'Title',
  description: 'Content',
  dueDate: 'Time',
  startDate: 'Start date',
  hideUntil: 'Hide until',
  repeat: 'Repeat',
  flagged: 'Flag',
  completed: 'Completed',
  deleted: 'Deleted',
  subtask: 'Subtask',
  tag: 'Tag',
  file: 'File',
};

function compareOccurrences(a: { completedAt: string; id: string }, b: { completedAt: string; id: string }): number {
  // The reverse of the completed log's tie-break, so the two views agree on which row is newer.
  return a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function compareTimeline(a: { at: string; seq: number; id: string }, b: { at: string; seq: number; id: string }): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  if (a.seq !== b.seq) return a.seq - b.seq;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function taskAtRecord(record: OccurrenceRecord): Task {
  const snap = record.snapshot;
  return {
    id: record.taskId,
    title: snap.title,
    description: snap.description,
    status: snap.status,
    flagged: snap.flagged,
    startDate: snap.startDate,
    hideUntil: snap.hideUntil,
    dueDate: snap.dueDate,
    completedAt: snap.completedAt,
    completedOn: snap.completedOn,
    deletedAt: snap.deletedAt,
    deletedOn: snap.deletedOn,
    repeat: snap.repeat,
    subtasks: snap.subtasks.map((subtask) => ({ ...subtask })),
    tags: snap.tagIds.map((id) => ({ id, name: '' })),
  };
}

function effectOf(record: OccurrenceRecord, historyCount: number): TaskHistoryEffect {
  const planned = planOccurrence({
    id: record.id,
    task: taskAtRecord(record),
    kind: record.kind,
    on: record.completedOn,
    now: record.completedAt,
    historyCount,
    sortKey: record.snapshot.sortKey,
  });
  return {
    outcome: planned.outcome,
    status: planned.task.status,
    dueDate: planned.task.dueDate ?? null,
    startDate: planned.task.startDate ?? null,
    hideUntil: planned.task.hideUntil ?? null,
    completedOn: planned.task.completedOn ?? null,
  };
}

function canUndo(task: Task, record: OccurrenceRecord, historyCount: number, sortKey: string | null): boolean {
  try {
    planUndoOccurrence(task, record, historyCount, sortKey);
    return true;
  } catch {
    return false;
  }
}

function clip(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  if (one.length <= SNIPPET) return one;
  return `${one.slice(0, SNIPPET - 1)}…`;
}

function pacificYear(at: string): number {
  const year = new Intl.DateTimeFormat('en-US', { timeZone: HISTORY_ZONE, year: 'numeric' }).format(new Date(at));
  const parsed = Number(year);
  return Number.isInteger(parsed) ? parsed : 0;
}

function formatDay(value: string, year: number): string {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const label = `${MONTHS[m - 1] ?? value} ${d}`;
  return y === year ? label : `${label}, ${y}`;
}

function isStatus(value: unknown): value is Status {
  return value === 'open' || value === 'in_progress' || value === 'waiting';
}

interface SectionContext {
  status: Status;
  startDate?: unknown;
  completedAt?: unknown;
  deletedAt?: unknown;
}

function isContext(value: unknown): value is SectionContext {
  return !!value && typeof value === 'object' && !Array.isArray(value) && isStatus((value as { status?: unknown }).status);
}

function contextText(value: SectionContext, key: 'completedAt' | 'deletedAt'): string | null {
  const raw = value[key];
  return typeof raw === 'string' && raw ? raw : null;
}

function sectionName(value: unknown, at: string): string | null {
  if (!isContext(value)) return null;
  const today = localDate(new Date(at), HISTORY_ZONE);
  const start = typeof value.startDate === 'string' ? value.startDate : null;
  return SECTION_LABEL[sectionFor({
    id: 'history',
    title: 'history',
    status: value.status,
    startDate: start,
    completedAt: contextText(value, 'completedAt'),
    deletedAt: contextText(value, 'deletedAt'),
  }, today)];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? clip(value) : fallback;
}

function joinValues(before: string, after: string, hasBefore: boolean, hasAfter: boolean): string {
  if (hasBefore && hasAfter) return before === after ? after : `${before}${ARROW}${after}`;
  if (hasAfter) return after;
  return before;
}

function dayValue(field: string, value: unknown, year: number): { text: string; present: boolean } {
  if (value == null || value === '') {
    if (field === 'dueDate') return { text: 'No due date', present: value === null || value === '' };
    if (field === 'startDate') return { text: 'No start date', present: value === null || value === '' };
    if (field === 'hideUntil') return { text: "Don't hide", present: value === null || value === '' };
    return { text: 'Empty', present: value === '' };
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return { text: formatDay(value, year), present: true };
  return { text: clip(String(value)), present: true };
}

function repeatText(value: unknown): string {
  if (value == null) return "Doesn't repeat";
  const rule = asRecord(value);
  if (!rule || typeof rule.mode !== 'string') return 'Repeat';
  try {
    return repeatLabel(rule as unknown as RepeatRule);
  } catch {
    return 'Repeat';
  }
}

/** The short verb and detail for one stored row. The actor is added by the screen. */
function phraseFor(record: ActivityRecord): { verb: string; detail: string } {
  if (record.kind === 'created') return { verb: 'created the task', detail: textOf(record.after, '') };
  const year = pacificYear(record.at);
  switch (record.field) {
    case 'title':
      return { verb: 'changed the title', detail: joinValues(textOf(record.before, 'Empty'), textOf(record.after, 'Empty'), record.before != null, record.after != null) };
    case 'description':
      return { verb: 'edited the content', detail: joinValues(textOf(record.before, 'Empty'), textOf(record.after, 'Empty'), record.before != null, record.after != null) };
    case 'dueDate':
    case 'startDate':
    case 'hideUntil': {
      const before = dayValue(record.field, record.before, year);
      const after = dayValue(record.field, record.after, year);
      const verb = record.field === 'dueDate' ? 'changed the time' : record.field === 'startDate' ? 'changed the start date' : 'changed the hide-until date';
      return { verb, detail: joinValues(before.text, after.text, before.present, after.present) };
    }
    case 'repeat':
      return { verb: 'changed the repeat', detail: joinValues(repeatText(record.before), repeatText(record.after), true, true) };
    case 'flagged':
      return {
        verb: record.after === true ? 'flagged the task' : 'removed the flag',
        detail: `${record.before === true ? 'Flagged' : 'Not flagged'}${ARROW}${record.after === true ? 'Flagged' : 'Not flagged'}`,
      };
    case 'status':
      return { verb: 'moved the task', detail: sectionName(record.before, record.at) && sectionName(record.after, record.at) ? joinValues(sectionName(record.before, record.at)!, sectionName(record.after, record.at)!, true, true) : '' };
    case 'completed':
      return {
        verb: isContext(record.after) && contextText(record.after, 'completedAt') ? 'completed the task' : 'marked the task not done',
        detail: sectionName(record.before, record.at) && sectionName(record.after, record.at) ? joinValues(sectionName(record.before, record.at)!, sectionName(record.after, record.at)!, true, true) : '',
      };
    case 'deleted':
      return {
        verb: isContext(record.after) && contextText(record.after, 'deletedAt') ? 'deleted the task' : 'restored the task',
        detail: sectionName(record.before, record.at) && sectionName(record.after, record.at) ? joinValues(sectionName(record.before, record.at)!, sectionName(record.after, record.at)!, true, true) : '',
      };
    case 'subtask':
      return subtaskPhrase(record.before, record.after);
    case 'tag':
      return linkPhrase(record.before, record.after, 'name', 'added a tag', 'removed a tag');
    case 'file':
      return linkPhrase(record.before, record.after, 'filename', 'added a file', 'removed a file');
    default:
      return { verb: 'changed the task', detail: '' };
  }
}

function subtaskPhrase(before: unknown, after: unknown): { verb: string; detail: string } {
  const from = asRecord(before);
  const to = asRecord(after);
  if (!from && to) return { verb: 'added a subtask', detail: textOf(to.title, 'Subtask') };
  if (from && !to) return { verb: 'removed a subtask', detail: textOf(from.title, 'Subtask') };
  if (from && to) {
    const oldTitle = textOf(from.title, 'Subtask');
    const newTitle = textOf(to.title, 'Subtask');
    if (oldTitle !== newTitle) return { verb: 'renamed a subtask', detail: `${oldTitle}${ARROW}${newTitle}` };
    if (from.done !== to.done) return { verb: to.done === true ? 'checked a subtask' : 'unchecked a subtask', detail: newTitle };
  }
  return { verb: 'changed a subtask', detail: '' };
}

function linkPhrase(before: unknown, after: unknown, key: string, added: string, removed: string): { verb: string; detail: string } {
  const from = asRecord(before);
  const to = asRecord(after);
  if (!from && to) return { verb: added, detail: textOf(to[key], '') };
  if (from && !to) return { verb: removed, detail: textOf(from[key], '') };
  if (from && to) return { verb: added, detail: joinValues(textOf(from[key], ''), textOf(to[key], ''), true, true) };
  return { verb: added, detail: '' };
}

function fieldEntry(record: ActivityRecord): FieldHistoryEntry {
  const phrase = phraseFor(record);
  return {
    id: record.id,
    taskId: record.taskId,
    at: record.at,
    action: record.kind,
    userId: record.userId,
    batchId: record.batchId,
    seq: record.seq,
    field: record.field,
    before: record.before,
    after: record.after,
    verb: phrase.verb,
    detail: phrase.detail,
  };
}

function rank(entry: TaskHistoryEntry): { at: string; seq: number; id: string } {
  if (isOccurrenceHistory(entry)) return { at: entry.at, seq: 0, id: entry.id };
  return { at: entry.at, seq: entry.seq, id: entry.id };
}

/**
 * One task's timeline, oldest first: field changes unioned with completions and skips.
 * Other tasks' rows are ignored. `sortKey` is the task's current board position, which undo checks.
 * Pass either list in any order. Occurrence rows are not copied into the field changes.
 */
export function taskHistory(
  task: Task,
  records: readonly OccurrenceRecord[],
  sortKey: string | null,
  activities: readonly ActivityRecord[] = [],
): TaskHistoryEntry[] {
  const mine = records.filter((record) => record.taskId === task.id).sort(compareOccurrences);
  const occurrences: OccurrenceHistoryEntry[] = mine.map((record, index) => ({
    id: record.id,
    taskId: record.taskId,
    at: record.completedAt,
    kind: record.kind,
    action: record.kind === 'skip' ? 'skipped' : 'completed',
    label: record.kind === 'skip' ? 'Skipped' : 'Done',
    occurrenceDue: record.occurrenceDue,
    completedOn: record.completedOn,
    completedAt: record.completedAt,
    effect: effectOf(record, index),
    undoable: index === mine.length - 1 && canUndo(task, record, index, sortKey),
  }));
  const fields = activities.filter((record) => record.taskId === task.id).map(fieldEntry);
  return [...occurrences, ...fields].sort((a, b) => compareTimeline(rank(a), rank(b)));
}

/**
 * Groups the timeline into cards, oldest first. The screen reverses that.
 * Several fields from one save share a card. A status change in that save is "moved the task".
 */
export function historyCards(entries: readonly TaskHistoryEntry[]): HistoryCard[] {
  const groups = new Map<string, TaskHistoryEntry[]>();
  const order: string[] = [];
  for (const entry of entries) {
    const key = isOccurrenceHistory(entry) ? entry.id : entry.batchId;
    const list = groups.get(key);
    if (list) list.push(entry);
    else {
      groups.set(key, [entry]);
      order.push(key);
    }
  }
  return order.map((key) => toCard(groups.get(key)!));
}

function toCard(entries: TaskHistoryEntry[]): HistoryCard {
  const first = entries[0]!;
  if (isOccurrenceHistory(first)) {
    return {
      id: first.id,
      at: first.at,
      verb: first.kind === 'skip' ? 'skipped an occurrence' : 'completed an occurrence',
      lines: [],
      undoable: first.undoable,
      occurrence: first,
      field: null,
    };
  }
  const fields = entries.filter((entry): entry is FieldHistoryEntry => !isOccurrenceHistory(entry));
  const verb = fields.length === 1 ? fields[0]!.verb : fields.some((entry) => entry.field === 'status') ? 'moved the task' : 'changed the task';
  const many = fields.length > 1;
  return {
    id: fields[0]!.batchId,
    at: fields[0]!.at,
    verb,
    lines: fields
      .filter((entry) => entry.detail)
      .map((entry) => ({
        detail: many && !(entry.field === 'status' && verb === 'moved the task') && LINE_LABEL[entry.field]
          ? `${LINE_LABEL[entry.field]}: ${entry.detail}`
          : entry.detail,
      })),
    undoable: false,
    occurrence: null,
    field: fields.length === 1 ? fields[0]!.field : null,
  };
}

/**
 * "just now" for the last minute, otherwise a Pacific date and time.
 * The year is included when it is not the year of `now` in Pacific.
 */
export function historyWhen(at: string, now: Date = new Date()): string {
  const then = new Date(at);
  const delta = now.getTime() - then.getTime();
  if (delta >= 0 && delta < 60_000) return 'just now';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HISTORY_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(then);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const date = `${get('month')} ${get('day')}`;
  const clock = `${get('hour')}:${get('minute')} ${get('dayPeriod')}`;
  const nowYear = new Intl.DateTimeFormat('en-US', { timeZone: HISTORY_ZONE, year: 'numeric' }).format(now);
  return get('year') === nowYear ? `${date}, ${clock}` : `${date}, ${get('year')}, ${clock}`;
}

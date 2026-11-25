import schema from './capture-schema.json' with { type: 'json' };
import { isValidDate, weekdayOf } from './dates.ts';
import { planChange, planNewTask, type PositionWrite, type TaskPatch } from './mutations.ts';
import { sameRepeat, startForDue, validateRepeat } from './repeat.ts';
import { applySubtaskChange, planAddSubtask } from './subtasks.ts';
import { checkTagName, planTaskTags } from './tags.ts';
import { changeStatus, setDueDate, waitUntil } from './transitions.ts';
import { STATUSES, type ISODate, type RepeatRule, type Status, type Subtask, type Tag, type Task, type Weekday } from './types.ts';
import { validateTask } from './validate.ts';

/** Identifies the reply schema. The Edge Function copies this id and `capture-schema.json`. */
export const CAPTURE_SCHEMA_ID = 'capture-schema-2';

/** The longest note Capture will send. The Edge Function uses the same cap. */
export const CAPTURE_MAX_CHARS = 4000;

/** How many proposed actions one review will keep. */
export const CAPTURE_MAX_ACTIONS = 20;

/**
 * The rules the model is given, word for word. The Edge Function inlines this same string.
 * The model is not shown the board. Matching happens on the device after the reply comes back.
 */
export const CAPTURE_RULES =
  'You can create a task, update an existing task, or add a note to an existing task. You are not shown the task list. You never receive task titles, descriptions, or ids. For an update or a note, set match to a short title hint such as follow up with Dan. Never include an id. Do not decide whether a task exists. Do not set confidence to low only because the list is hidden. If you are not sure what to do, set confidence to low and actions to an empty list. Never guess a task. Do not create a task when the note asks to update one or to add a note. If the note only asks to complete, delete, or flag a task, or to change its subtasks, set confidence to low and actions to an empty list. The summary is one short sentence reading what they asked for, not a transcript. Dates are YYYY-MM-DD. A start date is the day an Open task becomes ready, and only an Open task has one. Hide until is the date on a Waiting task, and only a Waiting task has one. The due date is the deadline. Waiting on someone means status waiting. The start date has to be on or before the due date. Hide until may be after the due date. A repeat needs a due date. Use an existing tag name when one fits. An update lists only the fields that change. Note text is added to the description and does not replace it.';

export const LOW_CONFIDENCE_MESSAGE = "I couldn't tell what to add. Nothing was saved.";

export const NO_MATCH_MESSAGE = 'No task was found.';

export const WHICH_TASK_ASK = 'Which task?';

export const UPDATE_REPEAT_ASK = 'Update its repeat, or create another?';

export const UPDATE_OR_CREATE_ASK = 'Update it, or create another?';

export const WHICH_OR_CREATE_ASK = 'Which task, or create another?';

const WEEKDAY_NAME: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** JSON schema sent to the provider. `core` still checks the reply; the schema only steers the model. */
export const CAPTURE_RESPONSE_SCHEMA: object = schema;

export interface CapturePromptContext {
  today: ISODate;
  timeZone: string;
  tags: readonly string[];
}

/** What the model is asked. The note is last, so the rules stay in front of it. */
export function capturePrompt(text: string, context: CapturePromptContext): string {
  const tags = context.tags.length > 0 ? context.tags.join(', ') : 'none';
  return [
    `Today is ${WEEKDAY_NAME[weekdayOf(context.today)]}, ${context.today}. The time zone is ${context.timeZone}.`,
    CAPTURE_RULES,
    `Existing tags: ${tags}.`,
    '',
    text,
  ].join('\n');
}

export type CaptureConfidence = 'high' | 'low';

export interface CaptureMark {
  field: string;
  message: string;
}

/** One create, after invalid fields have been dropped or fixed. */
export interface CaptureCreate {
  type: 'create';
  title: string;
  description: string;
  startDate: ISODate | null;
  hideUntil: ISODate | null;
  dueDate: ISODate | null;
  status: Status;
  flagged: boolean;
  tags: string[];
  subtasks: string[];
  repeat: RepeatRule | null;
}

/** Fields an update will change. A missing field stays as it is. */
export interface CapturePatch {
  startDate?: ISODate | null;
  hideUntil?: ISODate | null;
  dueDate?: ISODate | null;
  status?: Status;
  flagged?: boolean;
  repeat?: RepeatRule | null;
}

/** An update to one existing task. `taskId` is set once a single task is chosen. */
export interface CaptureUpdate {
  type: 'update';
  match: string;
  taskId: string | null;
  title: string;
  patch: CapturePatch;
}

/** Text added to an existing task's description. It does not replace that description. */
export interface CaptureAppendNote {
  type: 'append_note';
  match: string;
  taskId: string | null;
  title: string;
  text: string;
}

export type CaptureAction = CaptureCreate | CaptureUpdate | CaptureAppendNote;

export interface CaptureCandidate {
  id: string;
  title: string;
}

export interface CaptureCard {
  /** Stable for this review, so a dropped card stays dropped. */
  id: string;
  action: CaptureAction;
  marks: CaptureMark[];
  /** Tasks that fit the hint. Empty once one is chosen, or when the match was unique. */
  candidates: CaptureCandidate[];
  /** Shown when Dave has to pick before anything can be saved. */
  ask?: string;
}

export interface CaptureReview {
  /** A short reading of the request. Empty when the reply had none. */
  summary: string;
  confidence: CaptureConfidence;
  /** Shown when nothing will be saved, or when a kept field was assumed. */
  message?: string;
  /** Review-wide remarks, such as a hint that matched nothing. */
  notes: string[];
  cards: CaptureCard[];
}

const FAILURE_MESSAGES: Record<string, string> = {
  not_configured: "Capture isn't set up yet. Nothing was saved.",
  too_long: "That's too long to capture. Shorten it and try again.",
  rate_limited: 'Too many captures just now. Wait a moment and try again.',
  unauthorized: 'Capture needs you to be signed in. Nothing was saved.',
  empty: 'Nothing to add.',
  provider_error: "Capture didn't get an answer. Nothing was saved.",
};

const GENERIC_FAILURE = "Capture didn't get an answer. Nothing was saved.";

function modelUnavailableMessage(model?: string): string {
  const name = model?.trim();
  return name ? `Capture's model ${name} is unavailable. Nothing was saved.` : "Capture's model is unavailable. Nothing was saved.";
}

/** A failed call, or a capture that isn't set up. No tasks, and nothing is saved. */
export function reviewFromFailure(code?: string, model?: string): CaptureReview {
  const message = code === 'model_unavailable' ? modelUnavailableMessage(model) : (code && FAILURE_MESSAGES[code]) || GENERIC_FAILURE;
  return {
    summary: '',
    confidence: 'low',
    message,
    notes: [],
    cards: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface CaptureFailure {
  code: string;
  /** The model the function called, when that model is unavailable. */
  model?: string;
}

/** A provider error body, as opposed to a review the model actually returned. */
export function captureFailure(value: unknown): CaptureFailure | null {
  if (!isRecord(value) || typeof value.error !== 'string') return null;
  if (value.confidence === 'high' || value.confidence === 'low') return null;
  if (value.error !== 'model_unavailable') return { code: value.error };
  const model = typeof value.model === 'string' ? value.model.trim() : '';
  return model ? { code: value.error, model } : { code: value.error };
}

/** The error code from a provider failure body, or null when this is a real review. */
export function captureFailureCode(value: unknown): string | null {
  return captureFailure(value)?.code ?? null;
}

function low(summary: string, message: string = LOW_CONFIDENCE_MESSAGE): CaptureReview {
  return { summary, confidence: 'low', message, notes: [], cards: [] };
}

function cleanRepeat(value: unknown): { rule: RepeatRule | null; message?: string } {
  if (value == null) return { rule: null };
  if (!isRecord(value)) return { rule: null, message: 'Repeat dropped: Repeat must be an object' };
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item == null) continue;
    if (Array.isArray(item) && item.length === 0) continue;
    copy[key] = item;
  }
  if (isRecord(copy.monthly)) {
    const monthly = copy.monthly;
    if (monthly.day != null && monthly.nth == null && monthly.weekday == null) copy.monthly = { day: monthly.day };
    else if (monthly.day == null && monthly.nth != null && monthly.weekday != null) copy.monthly = { nth: monthly.nth, weekday: monthly.weekday };
    else if (monthly.day == null && monthly.nth == null && monthly.weekday == null) delete copy.monthly;
  }
  if (isRecord(copy.ends)) {
    const ends = copy.ends;
    if (ends.never === true) copy.ends = { never: true };
    else if (typeof ends.onDate === 'string') copy.ends = { onDate: ends.onDate };
    else if (typeof ends.afterCount === 'number') copy.ends = { afterCount: ends.afterCount };
    else delete copy.ends;
  }
  if (Object.keys(copy).length === 0) return { rule: null };
  const issues = validateRepeat(copy);
  if (issues.length > 0) return { rule: null, message: `Repeat dropped: ${issues.map((issue) => issue.message).join('; ')}` };
  return { rule: copy as unknown as RepeatRule };
}

function parseDate(value: unknown): { date: ISODate | null; bad: boolean } {
  if (value == null || value === '') return { date: null, bad: false };
  if (typeof value !== 'string') return { date: null, bad: true };
  const trimmed = value.trim();
  return isValidDate(trimmed) ? { date: trimmed, bad: false } : { date: null, bad: true };
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'for', 'of', 'on', 'in', 'into', 'and', 'or', 'my', 'with', 'from', 'at', 'by', 'is', 'it', 'this', 'that', 'be', 'are', 'was', 'am',
]);

function stemToken(token: string): string {
  if (token.length > 5 && token.endsWith('ing')) {
    const stem = token.slice(0, -3);
    if (stem.length >= 3) return stem;
  }
  if (token.length > 4 && token.endsWith('es') && !token.endsWith('ss')) {
    const stem = token.slice(0, -2);
    if (stem.length >= 3) return stem;
  }
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function hintTokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const tokens: string[] = [];
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    const stem = stemToken(word);
    if (!stem || STOP_WORDS.has(stem) || tokens.includes(stem)) continue;
    tokens.push(stem);
  }
  return tokens;
}

function openTask(task: Task): boolean {
  return !task.deletedAt && !task.completedAt;
}

/**
 * Tasks on this device whose title or description fits the hint.
 * Completed and trashed tasks are left out, the same way search leaves them out.
 * Every hint word has to be present, so a single shared word is not a match.
 */
export function matchCaptureTasks(hint: string, tasks: readonly Task[]): Task[] {
  const tokens = hintTokens(hint);
  if (tokens.length === 0) return [];
  const hits = tasks.filter((task) => {
    if (!openTask(task)) return false;
    const hay = hintTokens(`${task.title} ${task.description ?? ''}`);
    return tokens.every((token) => hay.includes(token));
  });
  return hits.sort((a, b) => {
    const aTitle = tokens.every((token) => hintTokens(a.title).includes(token));
    const bTitle = tokens.every((token) => hintTokens(b.title).includes(token));
    if (aTitle !== bTitle) return aTitle ? -1 : 1;
    return 0;
  });
}

function candidatesOf(tasks: readonly Task[]): CaptureCandidate[] {
  return tasks.map((task) => ({ id: task.id, title: task.title }));
}

const DATE_LABEL: Record<'startDate' | 'hideUntil' | 'dueDate', string> = {
  startDate: 'Start date',
  hideUntil: 'Hide until',
  dueDate: 'Due date',
};

function readPatchDate(value: unknown, field: 'startDate' | 'hideUntil' | 'dueDate', marks: CaptureMark[]): ISODate | undefined {
  if (value == null || value === '') return undefined;
  const parsed = parseDate(value);
  if (parsed.bad || !parsed.date) {
    marks.push({ field, message: `${DATE_LABEL[field]} dropped: not a valid date` });
    return undefined;
  }
  return parsed.date;
}

/** The fields the model sent. Subtasks, tags, and a replacement description are not applied. */
function readPatch(value: Record<string, unknown>): { patch: CapturePatch; marks: CaptureMark[] } {
  const marks: CaptureMark[] = [];
  const patch: CapturePatch = {};
  const startDate = readPatchDate(value.startDate, 'startDate', marks);
  const hideUntil = readPatchDate(value.hideUntil, 'hideUntil', marks);
  const dueDate = readPatchDate(value.dueDate, 'dueDate', marks);
  if (startDate) patch.startDate = startDate;
  if (hideUntil) patch.hideUntil = hideUntil;
  if (dueDate) patch.dueDate = dueDate;
  if (value.status != null && value.status !== '') {
    if (typeof value.status === 'string' && (STATUSES as readonly string[]).includes(value.status)) patch.status = value.status as Status;
    else marks.push({ field: 'status', message: 'Status dropped' });
  }
  if (value.flagged != null && value.flagged !== '') {
    if (typeof value.flagged === 'boolean') patch.flagged = value.flagged;
    else marks.push({ field: 'flagged', message: 'Flag dropped' });
  }
  if (value.repeat != null && value.repeat !== '') {
    const cleaned = cleanRepeat(value.repeat);
    if (cleaned.message) marks.push({ field: 'repeat', message: cleaned.message });
    else if (cleaned.rule) patch.repeat = cleaned.rule;
  }
  if (Array.isArray(value.subtasks) && value.subtasks.some((title) => typeof title === 'string' && title.trim() !== '')) {
    marks.push({ field: 'subtasks', message: 'Subtasks left out' });
  }
  if (Array.isArray(value.tags) && value.tags.length > 0) marks.push({ field: 'tags', message: 'Tags left out' });
  if (typeof value.description === 'string' && value.description.trim() !== '') marks.push({ field: 'description', message: 'Description left unchanged' });
  return { patch, marks };
}

function applyCapturePatch(task: Task, patch: CapturePatch): { task: Task; marks: CaptureMark[] } {
  const marks: CaptureMark[] = [];
  let next: Task = { ...task };
  if (patch.status && patch.status !== next.status) next = changeStatus(next, patch.status);
  if (patch.hideUntil !== undefined) {
    if (next.status !== 'waiting') marks.push({ field: 'hideUntil', message: 'Hide until dropped: only Waiting tasks have one' });
    else next = waitUntil(next, patch.hideUntil);
  }
  if (patch.dueDate !== undefined) {
    const changed = setDueDate(next, patch.dueDate);
    next = changed.task;
    if (changed.startMoved) marks.push({ field: 'startDate', message: `Start date moved to ${changed.startMoved.to}` });
  }
  if (patch.startDate !== undefined) {
    if (next.status !== 'open') marks.push({ field: 'startDate', message: 'Start date dropped: only Ready and Upcoming tasks have one' });
    else if (patch.startDate && next.dueDate && patch.startDate > next.dueDate) {
      marks.push({ field: 'startDate', message: `Start date moved to ${next.dueDate}` });
      next = { ...next, startDate: next.dueDate };
    } else next = { ...next, startDate: patch.startDate };
  }
  if (patch.flagged !== undefined) next = { ...next, flagged: patch.flagged };
  if (patch.repeat !== undefined) {
    if (patch.repeat && !next.dueDate) marks.push({ field: 'repeat', message: 'Repeat dropped: a repeat needs a due date' });
    else next = { ...next, repeat: patch.repeat };
  }
  const issues = validateTask(next);
  if (issues.length > 0) return { task, marks: [...marks, ...issues.map((issue) => ({ field: issue.field, message: issue.message }))] };
  return { task: next, marks };
}

function changedPatch(before: Task, after: Task): CapturePatch {
  const patch: CapturePatch = {};
  if ((before.startDate ?? null) !== (after.startDate ?? null)) patch.startDate = after.startDate ?? null;
  if ((before.hideUntil ?? null) !== (after.hideUntil ?? null)) patch.hideUntil = after.hideUntil ?? null;
  if ((before.dueDate ?? null) !== (after.dueDate ?? null)) patch.dueDate = after.dueDate ?? null;
  if (before.status !== after.status) patch.status = after.status;
  if ((before.flagged ?? false) !== (after.flagged ?? false)) patch.flagged = after.flagged ?? false;
  if (!sameRepeat(before.repeat ?? null, after.repeat ?? null)) patch.repeat = after.repeat ?? null;
  return patch;
}

function settlePatch(task: Task, patch: CapturePatch, marks: CaptureMark[]): { patch: CapturePatch; marks: CaptureMark[] } {
  const preview = applyCapturePatch(task, patch);
  return { patch: changedPatch(task, preview.task), marks: [...marks, ...preview.marks] };
}

function buildCreate(value: Record<string, unknown>, index: number, today: ISODate | undefined): CaptureCard | undefined {
  if (typeof value.title !== 'string' || value.title.trim() === '') return undefined;
  const marks: CaptureMark[] = [];

  let status: Status = 'open';
  if (value.status != null && value.status !== '') {
    if (typeof value.status === 'string' && (STATUSES as readonly string[]).includes(value.status)) status = value.status as Status;
    else marks.push({ field: 'status', message: 'Status dropped' });
  }

  const due = parseDate(value.dueDate);
  const start = parseDate(value.startDate);
  const hide = parseDate(value.hideUntil);
  if (due.bad) marks.push({ field: 'dueDate', message: 'Due date dropped: not a valid date' });
  if (start.bad) marks.push({ field: 'startDate', message: 'Start date dropped: not a valid date' });
  if (hide.bad) marks.push({ field: 'hideUntil', message: 'Hide until dropped: not a valid date' });

  let dueDate = due.date;
  let startDate = start.date;
  let hideUntil = hide.date;
  const startExplicit = start.date != null;

  if (startDate && status !== 'open') {
    marks.push({ field: 'startDate', message: 'Start date dropped: only Ready and Upcoming tasks have one' });
    startDate = null;
  }
  if (hideUntil && status !== 'waiting') {
    marks.push({ field: 'hideUntil', message: 'Hide until dropped: only Waiting tasks have one' });
    hideUntil = null;
  }

  const cleaned = cleanRepeat(value.repeat);
  let repeat = cleaned.rule;
  if (cleaned.message) marks.push({ field: 'repeat', message: cleaned.message });
  if (repeat && !dueDate) {
    const anchor = repeat.mode === 'dates' && repeat.dates && repeat.dates.length > 0 ? [...repeat.dates].sort()[0]! : today;
    if (!anchor) {
      marks.push({ field: 'repeat', message: 'Repeat dropped: a repeat needs a due date' });
      repeat = null;
    } else {
      dueDate = anchor;
      marks.push({ field: 'dueDate', message: `Due date set to ${anchor}` });
    }
  }
  if (repeat && status === 'open' && !startExplicit && repeat.startOffsetDays != null && dueDate) {
    startDate = startForDue(dueDate, repeat);
  }
  if (startDate && dueDate && startDate > dueDate && status === 'open') {
    marks.push({ field: 'startDate', message: `Start date moved to ${dueDate}` });
    startDate = dueDate;
  }

  let description = '';
  if (value.description != null && value.description !== '') {
    if (typeof value.description === 'string') description = value.description.trim();
    else marks.push({ field: 'description', message: 'Description dropped' });
  }

  let flagged = false;
  if (value.flagged != null) {
    if (typeof value.flagged === 'boolean') flagged = value.flagged;
    else marks.push({ field: 'flagged', message: 'Flag dropped' });
  }

  const tags: string[] = [];
  if (value.tags != null) {
    if (!Array.isArray(value.tags)) marks.push({ field: 'tags', message: 'Tags dropped' });
    else {
      for (const tag of value.tags) {
        if (typeof tag !== 'string') {
          marks.push({ field: 'tags', message: 'A tag was dropped' });
          continue;
        }
        const checked = checkTagName(tag, []);
        if (!checked.ok) {
          marks.push({ field: 'tags', message: `Tag dropped: ${checked.message}` });
          continue;
        }
        if (!tags.some((name) => name.toLowerCase() === checked.name.toLowerCase())) tags.push(checked.name);
      }
    }
  }

  const subtasks: string[] = [];
  if (value.subtasks != null) {
    if (!Array.isArray(value.subtasks)) marks.push({ field: 'subtasks', message: 'Subtasks dropped' });
    else {
      for (const title of value.subtasks) {
        if (typeof title !== 'string' || title.trim() === '') {
          if (title != null && title !== '') marks.push({ field: 'subtasks', message: 'A subtask was dropped' });
          continue;
        }
        subtasks.push(title.trim());
      }
    }
  }

  const action: CaptureCreate = {
    type: 'create',
    title: value.title.trim(),
    description,
    startDate,
    hideUntil,
    dueDate,
    status,
    flagged,
    tags,
    subtasks,
    repeat,
  };
  const issues = validateTask({
    title: action.title,
    description: action.description,
    status: action.status,
    flagged: action.flagged,
    startDate: action.startDate,
    hideUntil: action.hideUntil,
    dueDate: action.dueDate,
    repeat: action.repeat,
  });
  if (issues.length > 0) return undefined;
  return { id: `c${index}`, action, marks, candidates: [] };
}

function withCloseMatch(card: CaptureCard, tasks: readonly Task[]): CaptureCard {
  if (card.action.type !== 'create') return card;
  const found = matchCaptureTasks(card.action.title, tasks);
  if (found.length === 0) return card;
  const ask = found.length > 1 ? WHICH_OR_CREATE_ASK : card.action.repeat ? UPDATE_REPEAT_ASK : UPDATE_OR_CREATE_ASK;
  return { ...card, ask, candidates: candidatesOf(found) };
}

interface BuiltAction {
  card?: CaptureCard;
  unmatched?: string;
  skipped?: boolean;
}

function buildUpdate(value: Record<string, unknown>, index: number, tasks: readonly Task[]): BuiltAction {
  if (typeof value.match !== 'string' || value.match.trim() === '') return { skipped: true };
  const hint = value.match.trim();
  const read = readPatch(value);
  const found = matchCaptureTasks(hint, tasks);
  if (found.length === 0) return { unmatched: hint };
  if (found.length === 1) {
    const task = found[0]!;
    const settled = settlePatch(task, read.patch, read.marks);
    const action: CaptureUpdate = { type: 'update', match: hint, taskId: task.id, title: task.title, patch: settled.patch };
    return { card: { id: `c${index}`, action, marks: settled.marks, candidates: [] } };
  }
  const action: CaptureUpdate = { type: 'update', match: hint, taskId: null, title: hint, patch: read.patch };
  return { card: { id: `c${index}`, action, marks: read.marks, candidates: candidatesOf(found), ask: WHICH_TASK_ASK } };
}

function buildAppend(value: Record<string, unknown>, index: number, tasks: readonly Task[]): BuiltAction {
  if (typeof value.match !== 'string' || value.match.trim() === '') return { skipped: true };
  if (typeof value.text !== 'string' || value.text.trim() === '') return { skipped: true };
  const hint = value.match.trim();
  const text = value.text.trim();
  const found = matchCaptureTasks(hint, tasks);
  if (found.length === 0) return { unmatched: hint };
  if (found.length === 1) {
    const task = found[0]!;
    const action: CaptureAppendNote = { type: 'append_note', match: hint, taskId: task.id, title: task.title, text };
    return { card: { id: `c${index}`, action, marks: [], candidates: [] } };
  }
  const action: CaptureAppendNote = { type: 'append_note', match: hint, taskId: null, title: hint, text };
  return { card: { id: `c${index}`, action, marks: [], candidates: candidatesOf(found), ask: WHICH_TASK_ASK } };
}

function buildAction(value: unknown, index: number, today: ISODate | undefined, tasks: readonly Task[]): BuiltAction {
  if (!isRecord(value) || typeof value.type !== 'string') return {};
  if (value.type === 'create') {
    const card = buildCreate(value, index, today);
    return card ? { card: withCloseMatch(card, tasks) } : { skipped: true };
  }
  if (value.type === 'update') return buildUpdate(value, index, tasks);
  if (value.type === 'append_note') return buildAppend(value, index, tasks);
  return { skipped: true };
}

/**
 * Turns a model reply into cards. Matching uses `tasks` on this device.
 * The model never sees those tasks. Zero matches on an update or a note say so and do not create a task.
 * Several matches stay unresolved until one is chosen. A create whose title is close to an existing task
 * asks whether to update that task or create another. Invalid dates and repeats are dropped and marked.
 * Nothing here is saved.
 */
export function reviewCapture(reply: unknown, today?: ISODate, tasks: readonly Task[] = []): CaptureReview {
  if (!isRecord(reply)) return low('');
  const summary = typeof reply.summary === 'string' ? reply.summary.trim() : '';
  if (reply.confidence !== 'high') return low(summary);
  if (!Array.isArray(reply.actions)) return low(summary);
  if (reply.actions.length === 0) {
    return { summary, confidence: 'high', ...(summary ? {} : { message: 'Nothing to add.' }), notes: [], cards: [] };
  }

  const notes: string[] = [];
  const cards: CaptureCard[] = [];
  const unmatched: string[] = [];
  let skipped = 0;
  const limited = reply.actions.slice(0, CAPTURE_MAX_ACTIONS);
  if (reply.actions.length > CAPTURE_MAX_ACTIONS) notes.push(`Only the first ${CAPTURE_MAX_ACTIONS} actions are shown.`);
  for (let i = 0; i < limited.length; i++) {
    const built = buildAction(limited[i], i, today, tasks);
    if (built.card) cards.push(built.card);
    else if (built.unmatched) unmatched.push(built.unmatched);
    else if (built.skipped) skipped += 1;
  }
  if (cards.length === 0) {
    if (unmatched.length > 0 && skipped === 0) return { summary, confidence: 'high', message: NO_MATCH_MESSAGE, notes, cards: [] };
    return low(summary);
  }
  for (const hint of unmatched) notes.push(`No task was found for “${hint}”.`);
  if (skipped > 0) notes.push('Left out an action this capture cannot do yet.');
  return { summary, confidence: 'high', notes, cards };
}

/** A card can be saved once it names one task, or a new task that is not waiting on a choice. */
export function captureCardReady(card: CaptureCard): boolean {
  if (card.candidates.length > 0) return false;
  if (card.action.type === 'create') return true;
  return card.action.taskId != null;
}

function patchFromCreate(action: CaptureCreate): CapturePatch {
  const patch: CapturePatch = {};
  if (action.repeat) patch.repeat = action.repeat;
  if (action.dueDate) patch.dueDate = action.dueDate;
  if (action.startDate) patch.startDate = action.startDate;
  if (action.hideUntil) patch.hideUntil = action.hideUntil;
  if (action.status !== 'open') patch.status = action.status;
  if (action.flagged) patch.flagged = true;
  return patch;
}

function dueWasAssumed(card: CaptureCard): boolean {
  return card.marks.some((mark) => mark.field === 'dueDate' && mark.message.startsWith('Due date set to'));
}

/** The fields a close create should write onto the existing task. An assumed due date stays off when that task already has one. */
function patchForExisting(action: CaptureCreate, task: Task, assumedDue: boolean): CapturePatch {
  const patch: CapturePatch = {};
  if (action.repeat) patch.repeat = action.repeat;
  if (action.dueDate && (!assumedDue || !task.dueDate)) patch.dueDate = action.dueDate;
  if (action.startDate) patch.startDate = action.startDate;
  if (action.hideUntil) patch.hideUntil = action.hideUntil;
  if (action.status !== 'open') patch.status = action.status;
  if (action.flagged) patch.flagged = true;
  return patch;
}

/**
 * Binds a card to the task Dave picked. A close create becomes an update of that task.
 * Saving still waits for the confirm step.
 */
export function chooseCaptureTask(card: CaptureCard, taskId: string, tasks: readonly Task[] = []): CaptureCard {
  const candidate = card.candidates.find((item) => item.id === taskId);
  if (!candidate) return card;
  const task = tasks.find((item) => item.id === taskId);
  if (card.action.type === 'create') {
    const assumedDue = dueWasAssumed(card);
    const requested = task ? patchForExisting(card.action, task, assumedDue) : patchFromCreate(card.action);
    const settled = task ? settlePatch(task, requested, []) : { patch: requested, marks: [] as CaptureMark[] };
    const marks = [...settled.marks];
    if (card.action.subtasks.length > 0) marks.push({ field: 'subtasks', message: 'Subtasks left out' });
    if (card.action.tags.length > 0) marks.push({ field: 'tags', message: 'Tags left out' });
    if (card.action.description.trim() !== '') marks.push({ field: 'description', message: 'Description left unchanged' });
    const action: CaptureUpdate = { type: 'update', match: card.action.title, taskId, title: candidate.title, patch: settled.patch };
    return { id: card.id, action, marks, candidates: [] };
  }
  if (!task || card.action.type !== 'update') {
    return { ...card, ask: undefined, candidates: [], action: { ...card.action, taskId, title: candidate.title } };
  }
  const settled = settlePatch(task, card.action.patch, card.marks);
  const action: CaptureUpdate = { ...card.action, taskId, title: candidate.title, patch: settled.patch };
  return { id: card.id, action, marks: settled.marks, candidates: [] };
}

/** Keeps the proposed task as a new one, beside the close match Dave decided not to update. */
export function chooseCaptureCreate(card: CaptureCard): CaptureCard {
  if (card.action.type !== 'create') return card;
  return { id: card.id, action: card.action, marks: card.marks, candidates: [] };
}

/** Adds `text` after the current description. An empty description becomes the note. */
export function appendCaptureNote(description: string | undefined, text: string): string {
  const note = text.trim();
  const current = (description ?? '').replace(/\s+$/g, '');
  if (!note) return current;
  if (!current) return note;
  return `${current}\n${note}`;
}

/** New tasks land at the top of their section, so the first card is saved last and ends up above the others. */
export function captureApplyOrder<T>(cards: readonly T[]): T[] {
  return [...cards].reverse();
}

export interface PlannedCapture {
  kind: 'create' | 'update' | 'append_note';
  task: Task;
  before?: Task;
  patch: TaskPatch;
  clearPosition: boolean;
  tagCreates: { kind: 'create'; tag: Tag }[];
  positions: PositionWrite[];
}

/**
 * The writes a confirmed review will make, in save order.
 * A card that still needs a choice is left out. Planning validates every task first.
 * The caller writes only after this returns.
 */
export function planCaptureTasks(
  cards: readonly CaptureCard[],
  state: { tasks: readonly Task[]; tags: readonly Tag[]; positions: ReadonlyMap<string, string> },
  today: ISODate,
  newId: () => string,
): PlannedCapture[] {
  let tasks = [...state.tasks];
  let tags = [...state.tags];
  const positions = new Map(state.positions);
  const planned: PlannedCapture[] = [];
  for (const card of captureApplyOrder(cards)) {
    if (!captureCardReady(card)) continue;
    const action = card.action;
    if (action.type === 'create') {
      const tagPlan = planTaskTags(tags, [], action.tags, newId);
      tags = [...tags, ...tagPlan.creates.map((create) => create.tag)];
      let subtasks: Subtask[] = [];
      for (const title of action.subtasks) {
        subtasks = applySubtaskChange(subtasks, planAddSubtask(subtasks, { id: newId(), title }));
      }
      const task: Task = {
        id: newId(),
        title: action.title,
        description: action.description,
        status: action.status,
        flagged: action.flagged,
        startDate: action.startDate,
        hideUntil: action.hideUntil,
        dueDate: action.dueDate,
        repeat: action.repeat,
        tags: tagPlan.tags,
        subtasks,
      };
      const writes = planNewTask(tasks, positions, task, today);
      for (const write of writes) positions.set(write.taskId, write.sortKey);
      tasks = [...tasks, task];
      planned.push({ kind: 'create', task, patch: {}, clearPosition: false, tagCreates: tagPlan.creates, positions: writes });
      continue;
    }
    const before = tasks.find((task) => task.id === action.taskId);
    if (!before || !openTask(before)) continue;
    const after =
      action.type === 'append_note'
        ? { ...before, description: appendCaptureNote(before.description, action.text) }
        : applyCapturePatch(before, action.patch).task;
    const change = planChange(tasks, positions, before, after, today);
    if (change.clearPosition) positions.delete(after.id);
    for (const write of change.positions) positions.set(write.taskId, write.sortKey);
    tasks = tasks.map((task) => (task.id === after.id ? after : task));
    planned.push({
      kind: action.type,
      task: after,
      before,
      patch: change.patch,
      clearPosition: change.clearPosition,
      tagCreates: [],
      positions: change.positions,
    });
  }
  return planned;
}

export interface CaptureExampleExpectAction {
  type: 'create';
  title: string;
  description: string;
  startDate: ISODate | null;
  hideUntil: ISODate | null;
  dueDate: ISODate | null;
  status: Status;
  flagged: boolean;
  tags: string[];
  subtasks: string[];
  repeat: RepeatRule | null;
  marks: CaptureMark[];
}

export const CAPTURE_EXAMPLE_KINDS = ['create', 'update', 'append_note', 'no_match', 'ambiguous'] as const;

export type CaptureExampleKind = (typeof CAPTURE_EXAMPLE_KINDS)[number];

/** What a create review proposes. */
export interface CaptureCreateExpect {
  confidence: CaptureConfidence;
  message?: string;
  actions: CaptureExampleExpectAction[];
}

export interface CaptureUpdateExpect {
  outcome: 'update';
  creates: false;
  match: string;
  taskId: string;
  startDate: ISODate;
}

export interface CaptureAppendExpect {
  outcome: 'append_note';
  creates: false;
  match: string;
  taskId: string;
  text: string;
  replacesDescription: false;
}

export interface CaptureNoMatchExpect {
  outcome: 'no_match';
  creates: false;
  match?: string;
  message: string;
}

export interface CaptureAmbiguousExpect {
  outcome: 'ambiguous';
  creates: false;
  match?: string;
  ask: string;
  guesses: false;
  candidates: string[];
}

export type CaptureExampleExpect = CaptureCreateExpect | CaptureUpdateExpect | CaptureAppendExpect | CaptureNoMatchExpect | CaptureAmbiguousExpect;

interface CaptureExampleBase {
  id: string;
  input: string;
  implemented: true;
  /** The board this row is matched against. It is not part of the model reply. */
  tasks: Task[];
  reply: unknown;
}

export type CaptureExample =
  | (CaptureExampleBase & { kind: 'create'; expect: CaptureCreateExpect })
  | (CaptureExampleBase & { kind: 'update'; expect: CaptureUpdateExpect })
  | (CaptureExampleBase & { kind: 'append_note'; expect: CaptureAppendExpect })
  | (CaptureExampleBase & { kind: 'no_match'; expect: CaptureNoMatchExpect })
  | (CaptureExampleBase & { kind: 'ambiguous'; expect: CaptureAmbiguousExpect });

export interface CaptureExampleFile {
  version: number;
  today: ISODate;
  examples: CaptureExample[];
}

export function isCreateExample(example: CaptureExample): example is CaptureExample & { kind: 'create'; expect: CaptureCreateExpect } {
  return example.kind === 'create' && 'actions' in example.expect;
}

function captureExampleKind(value: unknown, id: string): CaptureExampleKind {
  if (typeof value === 'string' && (CAPTURE_EXAMPLE_KINDS as readonly string[]).includes(value)) return value as CaptureExampleKind;
  throw new Error(`Capture example ${id} needs a kind of ${CAPTURE_EXAMPLE_KINDS.join(', ')}.`);
}

function expectAction(value: unknown, id: string, index: number): CaptureExampleExpectAction {
  if (!isRecord(value) || value.type !== 'create' || typeof value.title !== 'string') {
    throw new Error(`Capture example ${id} action ${index} must be a create with a title.`);
  }
  return value as unknown as CaptureExampleExpectAction;
}

function replyActions(reply: unknown, id: string): Record<string, unknown>[] {
  if (!isRecord(reply) || !Array.isArray(reply.actions)) throw new Error(`Capture example ${id} reply needs an actions array.`);
  return reply.actions.map((action, index) => {
    if (!isRecord(action)) throw new Error(`Capture example ${id} reply action ${index} must be an object.`);
    return action;
  });
}

function readCreateExpect(item: Record<string, unknown>): CaptureCreateExpect {
  const expect = item.expect;
  if (!isRecord(expect)) throw new Error(`Capture example ${item.id} needs expect.`);
  if (expect.confidence !== 'high' && expect.confidence !== 'low') throw new Error(`Capture example ${item.id} needs confidence high or low.`);
  if (!Array.isArray(expect.actions)) throw new Error(`Capture example ${item.id} needs expect.actions.`);
  return {
    confidence: expect.confidence,
    ...(typeof expect.message === 'string' ? { message: expect.message } : {}),
    actions: expect.actions.map((action, index) => expectAction(action, String(item.id), index)),
  };
}

function readExampleTasks(value: unknown, id: string): Task[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`Capture example ${id} tasks must be an array.`);
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string') {
      throw new Error(`Capture example ${id} task ${index} needs an id and a title.`);
    }
    const status = item.status == null ? 'open' : item.status;
    if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) {
      throw new Error(`Capture example ${id} task ${item.id} needs a known status.`);
    }
    const completed = item.completed === true;
    const deleted = item.deleted === true;
    return {
      id: item.id,
      title: item.title,
      description: typeof item.description === 'string' ? item.description : '',
      status: status as Status,
      flagged: item.flagged === true,
      startDate: typeof item.startDate === 'string' ? item.startDate : null,
      hideUntil: typeof item.hideUntil === 'string' ? item.hideUntil : null,
      dueDate: typeof item.dueDate === 'string' ? item.dueDate : null,
      repeat: (item.repeat as RepeatRule | null | undefined) ?? null,
      completedAt: completed ? '2026-11-01T00:00:00.000Z' : null,
      completedOn: completed ? '2026-11-01' : null,
      deletedAt: deleted ? '2026-11-01T00:00:00.000Z' : null,
      deletedOn: deleted ? '2026-11-01' : null,
    };
  });
}

function readUpdateExpect(item: Record<string, unknown>): CaptureUpdateExpect {
  const id = String(item.id);
  const expect = item.expect;
  if (!isRecord(expect) || expect.outcome !== 'update' || expect.creates !== false) {
    throw new Error(`Capture example ${id} must expect an update and creates false.`);
  }
  if (typeof expect.match !== 'string' || typeof expect.taskId !== 'string' || !isValidDate(expect.startDate)) {
    throw new Error(`Capture example ${id} needs a match, a task id, and a start date.`);
  }
  const action = replyActions(item.reply, id)[0];
  if (!action || action.type !== 'update' || action.match !== expect.match || action.startDate !== expect.startDate) {
    throw new Error(`Capture example ${id} reply must update ${JSON.stringify(expect.match)} with the expected start date.`);
  }
  return { outcome: 'update', creates: false, match: expect.match, taskId: expect.taskId, startDate: String(expect.startDate) };
}

function readAppendExpect(item: Record<string, unknown>): CaptureAppendExpect {
  const id = String(item.id);
  const expect = item.expect;
  if (!isRecord(expect) || expect.outcome !== 'append_note' || expect.creates !== false || expect.replacesDescription !== false) {
    throw new Error(`Capture example ${id} must expect an appended note and must not replace the description.`);
  }
  if (typeof expect.match !== 'string' || typeof expect.taskId !== 'string' || typeof expect.text !== 'string') {
    throw new Error(`Capture example ${id} needs a match, a task id, and note text.`);
  }
  const action = replyActions(item.reply, id)[0];
  if (!action || action.type !== 'append_note' || action.match !== expect.match || action.text !== expect.text) {
    throw new Error(`Capture example ${id} reply must append the expected note.`);
  }
  return { outcome: 'append_note', creates: false, match: expect.match, taskId: expect.taskId, text: expect.text, replacesDescription: false };
}

function readNoMatchExpect(item: Record<string, unknown>): CaptureNoMatchExpect {
  const id = String(item.id);
  const expect = item.expect;
  if (!isRecord(expect) || expect.outcome !== 'no_match' || expect.creates !== false || expect.message !== NO_MATCH_MESSAGE) {
    throw new Error(`Capture example ${id} must say no task was found and must not create one.`);
  }
  const reply = item.reply;
  if (!isRecord(reply) || reply.confidence !== 'high' || !Array.isArray(reply.actions) || reply.actions.length === 0) {
    throw new Error(`Capture example ${id} reply proposes the action. The device decides that nothing matches.`);
  }
  return { outcome: 'no_match', creates: false, ...(typeof expect.match === 'string' ? { match: expect.match } : {}), message: NO_MATCH_MESSAGE };
}

function readAmbiguousExpect(item: Record<string, unknown>): CaptureAmbiguousExpect {
  const id = String(item.id);
  const expect = item.expect;
  if (!isRecord(expect) || expect.outcome !== 'ambiguous' || expect.creates !== false || expect.guesses !== false || typeof expect.ask !== 'string') {
    throw new Error(`Capture example ${id} must ask and must not guess or create a task.`);
  }
  if (!Array.isArray(expect.candidates) || expect.candidates.some((candidate) => typeof candidate !== 'string')) {
    throw new Error(`Capture example ${id} needs the candidate task ids.`);
  }
  const reply = item.reply;
  if (!isRecord(reply) || reply.confidence !== 'high' || !Array.isArray(reply.actions) || reply.actions.length === 0) {
    throw new Error(`Capture example ${id} reply proposes the action. The device asks which task.`);
  }
  return {
    outcome: 'ambiguous',
    creates: false,
    ...(typeof expect.match === 'string' ? { match: expect.match } : {}),
    ask: expect.ask,
    guesses: false,
    candidates: expect.candidates as string[],
  };
}

/** Checks the example file enough that a replay can't silently skip a row. */
export function readCaptureExamples(data: unknown): CaptureExampleFile {
  if (!isRecord(data) || !Array.isArray(data.examples) || typeof data.today !== 'string' || !isValidDate(data.today)) {
    throw new Error('capture-examples.json needs a today date and an examples array.');
  }
  const seen = new Set<string>();
  const examples: CaptureExample[] = data.examples.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.input !== 'string' || !isRecord(item.expect)) {
      throw new Error(`Capture example ${index} needs an id, input and expect.`);
    }
    if (seen.has(item.id)) throw new Error(`Capture example id "${item.id}" is repeated.`);
    seen.add(item.id);
    const kind = captureExampleKind(item.kind, item.id);
    if (item.implemented !== true) throw new Error(`Capture example ${item.id} is implemented in this slice.`);
    const tasks = readExampleTasks(item.tasks, item.id);
    const shared = { id: item.id, input: item.input, implemented: true as const, tasks, reply: item.reply };
    if (kind === 'create') return { ...shared, kind, expect: readCreateExpect(item) };
    if (kind === 'update') return { ...shared, kind, expect: readUpdateExpect(item) };
    if (kind === 'append_note') return { ...shared, kind, expect: readAppendExpect(item) };
    if (kind === 'no_match') return { ...shared, kind, expect: readNoMatchExpect(item) };
    return { ...shared, kind, expect: readAmbiguousExpect(item) };
  });
  return { version: typeof data.version === 'number' ? data.version : 0, today: data.today, examples };
}

/** The fields a test or the CLI compares, in a stable shape. */
export function captureCardSnapshot(card: CaptureCard): { marks: CaptureMark[] } & Record<string, unknown> {
  return {
    ...card.action,
    marks: card.marks,
    ...(card.candidates.length > 0 ? { candidates: card.candidates.map((candidate) => ({ id: candidate.id, title: candidate.title })) } : {}),
    ...(card.ask ? { ask: card.ask } : {}),
  };
}

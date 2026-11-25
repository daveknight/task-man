import schema from './capture-schema.json' with { type: 'json' };
import { isValidDate, weekdayOf } from './dates.ts';
import { planNewTask, type PositionWrite } from './mutations.ts';
import { startForDue, validateRepeat } from './repeat.ts';
import { applySubtaskChange, planAddSubtask } from './subtasks.ts';
import { checkTagName, planTaskTags } from './tags.ts';
import { STATUSES, type ISODate, type RepeatRule, type Status, type Subtask, type Tag, type Task, type Weekday } from './types.ts';
import { validateTask } from './validate.ts';

/** Identifies the reply schema. The Edge Function copies this id and `capture-schema.json`. */
export const CAPTURE_SCHEMA_ID = 'capture-schema-1';

/** The longest note Capture will send. The Edge Function uses the same cap. */
export const CAPTURE_MAX_CHARS = 4000;

/** How many proposed creates one review will keep. */
export const CAPTURE_MAX_ACTIONS = 20;

/**
 * The rules the model is given, word for word. The Edge Function inlines this same string.
 * Slice 1 can only create. Update and append-note come back as low confidence.
 */
export const CAPTURE_RULES =
  'You can only create new tasks. If the note asks to update, complete, delete, or add a note on a task that already exists, set confidence to low and actions to an empty list. Do not invent a new task for that. If you are not sure what to add, set confidence to low and actions to an empty list. Never guess a task. The summary is one short sentence reading what they asked for, not a transcript. Dates are YYYY-MM-DD. A start date is the day an Open task becomes ready, and only an Open task has one. Hide until is a Waiting task\'s own date, and only a Waiting task has one. The due date is the deadline. Waiting on someone means status waiting. The start date has to be on or before the due date. Hide until may be after the due date. A repeat needs a due date. Use an existing tag name when one fits.';

export const LOW_CONFIDENCE_MESSAGE = "I couldn't tell what to add. Nothing was saved.";

const EXISTING_TASK_MESSAGE = 'That changes an existing task. Capture can only add new ones. Nothing was saved.';

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

export interface CaptureCard {
  /** Stable for this review, so a dropped card stays dropped. */
  id: string;
  action: CaptureCreate;
  marks: CaptureMark[];
}

export interface CaptureReview {
  /** A short reading of the request. Empty when the reply had none. */
  summary: string;
  confidence: CaptureConfidence;
  /** Shown when nothing will be added, or when a kept field was assumed. */
  message?: string;
  /** Review-wide remarks, such as a change to an existing task that was left out. */
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

interface BuiltCard {
  card?: CaptureCard;
  /** An action that isn't a create, such as an update. */
  existing?: boolean;
}

function buildCard(value: unknown, index: number, today: ISODate | undefined): BuiltCard {
  if (!isRecord(value)) return {};
  if (value.type !== 'create') return value.type == null ? {} : { existing: true };
  if (typeof value.title !== 'string' || value.title.trim() === '') return {};
  const marks: CaptureMark[] = [];

  let status: Status = 'open';
  if (value.status != null && value.status !== '') {
    if (typeof value.status === 'string' && (STATUSES as readonly string[]).includes(value.status)) status = value.status as Status;
    else {
      marks.push({ field: 'status', message: 'Status dropped' });
    }
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
  if (issues.length > 0) return {};
  return { card: { id: `c${index}`, action, marks } };
}

/**
 * Turns a model reply into cards. Low confidence, a reply that isn't the schema, or a reply
 * that only names changes to existing tasks yields no cards. Invalid dates and repeats are
 * dropped and marked; a start date after the due date moves to the due date and is marked.
 * Nothing here is saved.
 */
export function reviewCapture(reply: unknown, today?: ISODate): CaptureReview {
  if (!isRecord(reply)) return low('');
  const summary = typeof reply.summary === 'string' ? reply.summary.trim() : '';
  if (reply.confidence !== 'high') return low(summary);
  if (!Array.isArray(reply.actions)) return low(summary);
  if (reply.actions.length === 0) {
    return { summary, confidence: 'high', ...(summary ? {} : { message: 'Nothing to add.' }), notes: [], cards: [] };
  }

  const notes: string[] = [];
  const cards: CaptureCard[] = [];
  let existing = 0;
  const limited = reply.actions.slice(0, CAPTURE_MAX_ACTIONS);
  if (reply.actions.length > CAPTURE_MAX_ACTIONS) notes.push(`Only the first ${CAPTURE_MAX_ACTIONS} tasks are shown.`);
  for (let i = 0; i < limited.length; i++) {
    const built = buildCard(limited[i], i, today);
    if (built.existing) existing += 1;
    else if (built.card) cards.push(built.card);
  }
  if (cards.length === 0) return low(summary, existing > 0 ? EXISTING_TASK_MESSAGE : LOW_CONFIDENCE_MESSAGE);
  if (existing > 0) notes.push('Left out a change to an existing task. Capture only adds new ones.');
  return { summary, confidence: 'high', notes, cards };
}

/** New tasks land at the top of their section, so the first card is saved last and ends up above the others. */
export function captureApplyOrder<T>(cards: readonly T[]): T[] {
  return [...cards].reverse();
}

export interface PlannedCapture {
  task: Task;
  tagCreates: { kind: 'create'; tag: Tag }[];
  positions: PositionWrite[];
}

/**
 * The tasks a confirmed review will write, in save order, including tags and subtasks.
 * Planning validates every task first. The caller writes only after this returns.
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
    const tagPlan = planTaskTags(tags, [], card.action.tags, newId);
    tags = [...tags, ...tagPlan.creates.map((create) => create.tag)];
    let subtasks: Subtask[] = [];
    for (const title of card.action.subtasks) {
      subtasks = applySubtaskChange(subtasks, planAddSubtask(subtasks, { id: newId(), title }));
    }
    const task: Task = {
      id: newId(),
      title: card.action.title,
      description: card.action.description,
      status: card.action.status,
      flagged: card.action.flagged,
      startDate: card.action.startDate,
      hideUntil: card.action.hideUntil,
      dueDate: card.action.dueDate,
      repeat: card.action.repeat,
      tags: tagPlan.tags,
      subtasks,
    };
    const writes = planNewTask(tasks, positions, task, today);
    for (const write of writes) positions.set(write.taskId, write.sortKey);
    tasks = [...tasks, task];
    planned.push({ task, tagCreates: tagPlan.creates, positions: writes });
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

/** What slice 1 reviews: proposed creates. */
export interface CaptureCreateExpect {
  confidence: CaptureConfidence;
  message?: string;
  actions: CaptureExampleExpectAction[];
}

/**
 * What a later slice does with a row this slice does not perform.
 * `creates: false` is the whole promise: replaying it must not save a task.
 */
export interface CaptureDeferredExpect {
  outcome: Exclude<CaptureExampleKind, 'create'>;
  creates: false;
  match?: string;
  startDate?: ISODate;
  text?: string;
  replacesDescription?: false;
  message?: string;
  ask?: string;
  guesses?: false;
}

export interface CaptureExample {
  id: string;
  kind: CaptureExampleKind;
  input: string;
  /** False: fixture for a later slice. CI still replays the reply and does not call a provider. */
  implemented: boolean;
  reply: unknown;
  expect: CaptureCreateExpect | CaptureDeferredExpect;
}

export interface CaptureExampleFile {
  version: number;
  today: ISODate;
  examples: CaptureExample[];
}

export function isCreateExample(example: CaptureExample): example is CaptureExample & { kind: 'create'; implemented: true; expect: CaptureCreateExpect } {
  return example.kind === 'create' && example.implemented === true && 'actions' in example.expect;
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

function readDeferredExpect(item: Record<string, unknown>, kind: Exclude<CaptureExampleKind, 'create'>): CaptureDeferredExpect {
  const id = String(item.id);
  const expect = item.expect;
  if (!isRecord(expect) || expect.outcome !== kind || expect.creates !== false) {
    throw new Error(`Capture example ${id} must expect outcome ${kind} and creates false.`);
  }
  const actions = replyActions(item.reply, id);
  if (actions.some((action) => action.type === 'create')) throw new Error(`Capture example ${id} is not a create, so its reply must not include one.`);
  if (kind === 'update') {
    const action = actions[0];
    if (!action || action.type !== 'update' || action.match !== expect.match || action.startDate !== expect.startDate || !isValidDate(expect.startDate)) {
      throw new Error(`Capture example ${id} reply must update ${JSON.stringify(expect.match)} with the expected start date.`);
    }
    return { outcome: 'update', creates: false, match: String(expect.match), startDate: String(expect.startDate) };
  }
  if (kind === 'append_note') {
    const action = actions[0];
    if (!action || action.type !== 'append_note' || action.match !== expect.match || action.text !== expect.text || expect.replacesDescription !== false) {
      throw new Error(`Capture example ${id} reply must append the expected note and must not replace the description.`);
    }
    return { outcome: 'append_note', creates: false, match: String(expect.match), text: String(expect.text), replacesDescription: false };
  }
  if (kind === 'no_match') {
    if (!isRecord(item.reply) || item.reply.confidence !== 'low' || item.reply.summary !== expect.message || actions.length !== 0 || typeof expect.message !== 'string') {
      throw new Error(`Capture example ${id} must say no task was found and include no actions.`);
    }
    return { outcome: 'no_match', creates: false, ...(typeof expect.match === 'string' ? { match: expect.match } : {}), message: expect.message };
  }
  if (!isRecord(item.reply) || item.reply.confidence !== 'low' || item.reply.summary !== expect.ask || actions.length !== 0 || typeof expect.ask !== 'string' || expect.guesses !== false) {
    throw new Error(`Capture example ${id} must ask and must not guess or include actions.`);
  }
  return { outcome: 'ambiguous', creates: false, ...(typeof expect.match === 'string' ? { match: expect.match } : {}), ask: expect.ask, guesses: false };
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
    if (kind === 'create') {
      if (item.implemented !== true) throw new Error(`Capture example ${item.id} is a create, so it is implemented in this slice.`);
      return { id: item.id, kind, input: item.input, implemented: true, reply: item.reply, expect: readCreateExpect(item) };
    }
    if (item.implemented !== false) throw new Error(`Capture example ${item.id} is a later slice. It is replayed, not implemented.`);
    return {
      id: item.id,
      kind,
      input: item.input,
      implemented: false,
      reply: item.reply,
      expect: readDeferredExpect(item, kind),
    };
  });
  return { version: typeof data.version === 'number' ? data.version : 0, today: data.today, examples };
}

/** The fields a test or the CLI compares, in a stable shape. */
export function captureCardSnapshot(card: CaptureCard): CaptureExampleExpectAction {
  return { ...card.action, marks: card.marks };
}

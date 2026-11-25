import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  captureCardSnapshot,
  captureFailure,
  planCaptureTasks,
  readCaptureExamples,
  repeatLabel,
  reviewCapture,
  reviewFromFailure,
  type CaptureCard,
  type CaptureReview,
  type ISODate,
  type Task,
} from '@app/core';
import { insertTask, loadSnapshot, writeTagChange, type Scope } from '@app/data';
import { createClient } from '@supabase/supabase-js';
import { connection, DEV_USER } from './config.ts';
import { shortDate } from './format.ts';

export const CAPTURE_EXAMPLES_FILE = new URL('../../../seed/capture-examples.json', import.meta.url);

export function loadExample(id: string): { input: string; reply: unknown } {
  const file = readCaptureExamples(JSON.parse(readFileSync(CAPTURE_EXAMPLES_FILE, 'utf8')));
  const found = file.examples.find((example) => example.id === id);
  if (!found) throw new Error(`No capture example "${id}". Examples: ${file.examples.map((example) => example.id).join(', ')}.`);
  return { input: found.input, reply: found.reply };
}

export function loadReply(path: string): unknown {
  const file = resolve(process.env.INIT_CWD ?? process.cwd(), path);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Couldn't read the capture reply ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Recorded reply, or a reply file. Does not talk to a provider or the database. */
export function recordedReply(options: { example?: string; reply?: string; text: string }): { input: string; reply: unknown } {
  if (options.example && options.reply) throw new Error('Pass either --example or --reply, not both.');
  if (options.example) {
    if (options.text) throw new Error('capture --example reads the saved utterance. Leave the text off.');
    return loadExample(options.example);
  }
  if (!options.text) throw new Error('capture needs the note, or --example <id>. Run with --help.');
  if (!options.reply) throw new Error('capture needs --reply, --example, or a running local function.');
  return { input: options.text, reply: loadReply(options.reply) };
}

export function reviewRecorded(reply: unknown, today: ISODate): CaptureReview {
  const failure = captureFailure(reply);
  return failure ? reviewFromFailure(failure.code, failure.model) : reviewCapture(reply, today);
}

/** Writes the confirmed cards. Planning runs first, so an invalid card saves nothing. */
export async function applyCapture(scope: Scope, today: ISODate, cards: readonly CaptureCard[]): Promise<Task[]> {
  const snapshot = await loadSnapshot(scope);
  const planned = planCaptureTasks(cards, snapshot, today, () => crypto.randomUUID());
  const saved: Task[] = [];
  for (const item of planned) {
    for (const create of item.tagCreates) await writeTagChange(scope, create);
    saved.push(await insertTask(scope, item.task, item.positions));
  }
  return saved;
}

async function failureFrom(error: unknown): Promise<ReturnType<typeof captureFailure>> {
  const context = (error as { context?: unknown }).context;
  try {
    if (context && typeof (context as { json?: unknown }).json === 'function') {
      return captureFailure(await (context as { json: () => Promise<unknown> }).json());
    }
  } catch {
    return null;
  }
  return captureFailure(context);
}

/** Asks the local Edge Function. The key stays there; this only sends the note and a signed-in user. */
export async function fetchCaptureReply(body: { text: string; today: ISODate; timeZone: string; tags: string[]; provider?: string }): Promise<unknown> {
  const { url, anonKey } = connection();
  if (!anonKey) throw new Error('Local Supabase has no anon key, so capture cannot sign in.');
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email: DEV_USER.email, password: DEV_USER.password });
  if (signedIn.error) throw new Error(`Couldn't sign in for capture: ${signedIn.error.message}`);
  const result = await client.functions.invoke('parse-capture', { body });
  if (result.error) {
    const failure = await failureFrom(result.error);
    if (failure) return { error: failure.code, ...(failure.model ? { model: failure.model } : {}) };
    throw new Error(result.error.message);
  }
  return result.data;
}

export function formatCapture(review: CaptureReview, today: ISODate, applied: number | null): string {
  const lines: string[] = [];
  if (review.summary) lines.push(review.summary);
  if (review.message) lines.push(review.message);
  for (const note of review.notes) lines.push(note);
  for (const card of review.cards) {
    const action = card.action;
    const bits: string[] = [];
    if (action.status === 'in_progress') bits.push('In progress');
    if (action.status === 'waiting') bits.push('Waiting');
    if (action.flagged) bits.push('flagged');
    if (action.startDate) bits.push(`start ${shortDate(action.startDate, today)}`);
    if (action.hideUntil) bits.push(`hide until ${shortDate(action.hideUntil, today)}`);
    if (action.dueDate) bits.push(`due ${shortDate(action.dueDate, today)}`);
    if (action.repeat) bits.push(repeatLabel(action.repeat, action.dueDate));
    if (action.tags.length) bits.push(`tags ${action.tags.join(', ')}`);
    if (action.subtasks.length) bits.push(action.subtasks.length === 1 ? '1 subtask' : `${action.subtasks.length} subtasks`);
    lines.push('', bits.length ? `${action.title}  — ${bits.join(' · ')}` : action.title);
    for (const mark of card.marks) lines.push(`  ${mark.message}`);
  }
  lines.push('');
  if (applied == null) lines.push(review.cards.length ? 'Nothing was saved. Pass --apply to add these tasks.' : 'Nothing was saved.');
  else lines.push(applied === 0 ? 'Nothing was saved.' : `Added ${applied} task${applied === 1 ? '' : 's'}.`);
  return lines.join('\n');
}

export function captureJson(input: string, today: ISODate, review: CaptureReview, saved: { id: string; title: string }[] | null) {
  return {
    input,
    today,
    summary: review.summary,
    confidence: review.confidence,
    message: review.message ?? null,
    notes: review.notes,
    applied: (saved?.length ?? 0) > 0,
    ...(saved ? { saved } : {}),
    cards: review.cards.map(captureCardSnapshot),
  };
}

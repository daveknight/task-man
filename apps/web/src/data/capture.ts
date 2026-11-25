import { CAPTURE_MAX_CHARS, captureFailureCode, planCaptureTasks, reviewCapture, reviewFromFailure, type CaptureCard, type CaptureReview, type ISODate } from '@app/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/supabase';
import type { TaskWrites } from './board-data';

export { CAPTURE_MAX_CHARS };

async function invokeError(error: unknown): Promise<string | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  try {
    const body = typeof error.context?.json === 'function' ? await error.context.json() : error.context;
    return captureFailureCode(body);
  } catch {
    return null;
  }
}

async function replay(text: string, today: ISODate): Promise<CaptureReview> {
  const params = new URLSearchParams(window.location.search);
  if (params.has('slow')) await new Promise((resolve) => setTimeout(resolve, 600));
  const file = (await import('../../../../seed/capture-examples.json')).default as { examples: { input: string; reply: unknown }[] };
  const found = file.examples.find((example) => example.input === text);
  if (!found) return reviewCapture({ summary: "I couldn't tell what to add.", confidence: 'low', actions: [] }, today);
  return reviewCapture(found.reply, today);
}

/**
 * Asks the Edge Function for a review. Dev builds opened with `?capture=replay` use the recorded
 * examples instead, so a test never calls a provider. A missing key comes back as "not set up".
 */
export async function parseCapture(text: string, today: ISODate, tags: readonly string[]): Promise<CaptureReview> {
  const trimmed = text.trim();
  if (!trimmed) return reviewFromFailure('empty');
  if (trimmed.length > CAPTURE_MAX_CHARS) return reviewFromFailure('too_long');
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('capture') === 'replay') return replay(trimmed, today);
  try {
    const { data, error } = await supabase.functions.invoke('parse-capture', {
      body: { text: trimmed, today, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tags, provider: 'gemini' },
    });
    if (error) return reviewFromFailure((await invokeError(error)) ?? undefined);
    const code = captureFailureCode(data);
    return code ? reviewFromFailure(code) : reviewCapture(data, today);
  } catch {
    return reviewFromFailure();
  }
}

/** Writes confirmed cards. Returns how many were saved; a failure stops and leaves the rest unwritten. */
export async function saveCapture(cards: readonly CaptureCard[], writes: TaskWrites, today: ISODate): Promise<number> {
  const snapshot = writes.current();
  const planned = planCaptureTasks(cards, snapshot, today, () => crypto.randomUUID());
  let saved = 0;
  for (const item of planned) {
    try {
      for (const create of item.tagCreates) await writes.tagList(create);
      await writes.add(item.task);
      saved += 1;
    } catch {
      break;
    }
  }
  return saved;
}

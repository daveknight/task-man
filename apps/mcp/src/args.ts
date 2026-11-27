import { hasRepeatFlags, type RepeatFlags } from '@app/cli/repeat-flags';
import type { SubtaskEdits } from '@app/cli/tasks';

/** The repeat object the tools accept. Numbers are turned into the CLI's string flags. */
export interface RepeatInput {
  repeat?: string;
  mode?: string;
  interval?: number;
  byWeekday?: string;
  monthly?: string;
  dates?: string;
  startOffset?: number | 'none';
  ends?: string;
}

export interface SubtaskInput {
  add?: string[];
  done?: string[];
  undone?: string[];
  remove?: string[];
  rename?: { ref: string; title: string }[];
  move?: { ref: string; position: number }[];
}

export function toRepeatFlags(input: RepeatInput): RepeatFlags {
  return {
    ...(input.repeat !== undefined ? { repeat: input.repeat } : {}),
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
    ...(input.interval !== undefined ? { interval: String(input.interval) } : {}),
    ...(input.byWeekday !== undefined ? { byWeekday: input.byWeekday } : {}),
    ...(input.monthly !== undefined ? { monthly: input.monthly } : {}),
    ...(input.dates !== undefined ? { dates: input.dates } : {}),
    ...(input.startOffset !== undefined ? { startOffset: String(input.startOffset) } : {}),
    ...(input.ends !== undefined ? { ends: input.ends } : {}),
  };
}

export function repeatFlagsIfSet(input: RepeatInput | undefined): RepeatFlags | undefined {
  if (!input) return undefined;
  const flags = toRepeatFlags(input);
  return hasRepeatFlags(flags) ? flags : undefined;
}

/** `--tags a,b`, or `""` when the list is empty (that clears the task's tags). */
export function tagsFlag(tags: readonly string[] | undefined): string | undefined {
  if (tags === undefined) return undefined;
  return tags.join(',');
}

export function toSubtaskEdits(input: SubtaskInput | undefined): SubtaskEdits | undefined {
  if (!input) return undefined;
  const edits: SubtaskEdits = {
    ...(input.add ? { add: input.add } : {}),
    ...(input.done ? { done: input.done } : {}),
    ...(input.undone ? { undone: input.undone } : {}),
    ...(input.remove ? { remove: input.remove } : {}),
    ...(input.rename ? { rename: input.rename.map((item) => `${item.ref}=${item.title}`) } : {}),
    ...(input.move ? { move: input.move.map((item) => `${item.ref}=${item.position}`) } : {}),
  };
  return edits;
}

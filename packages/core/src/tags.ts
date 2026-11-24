import type { Tag, Task } from './types.ts';

/** The longest tag name, counted in characters. */
export const TAG_NAME_MAX = 30;

/** A tag name as stored: trimmed, with runs of whitespace collapsed to one space. Returns null when nothing is left. */
export function normalizeTagName(name: string): string | null {
  const collapsed = name.trim().replace(/\s+/g, ' ');
  return collapsed === '' ? null : collapsed;
}

/** What two names are compared by: tag names are unique ignoring case. */
export function tagKey(name: string): string {
  return (normalizeTagName(name) ?? '').toLowerCase();
}

export type TagNameProblem = 'empty' | 'too_long' | 'comma' | 'duplicate';

export type TagNameCheck = { ok: true; name: string } | { ok: false; reason: TagNameProblem; message: string };

/**
 * Whether `name` can be a tag's name: not empty, at most 30 characters, no commas (the CLI separates
 * tags with them), and not taken by another tag ignoring case. `selfId` is the tag being renamed, so
 * changing only its capitalization is fine.
 */
export function checkTagName(name: string, tags: readonly Tag[], selfId?: string): TagNameCheck {
  const normalized = normalizeTagName(name);
  if (normalized === null) return { ok: false, reason: 'empty', message: 'Tag name is required' };
  if ([...normalized].length > TAG_NAME_MAX) return { ok: false, reason: 'too_long', message: `Tag names are at most ${TAG_NAME_MAX} characters` };
  if (normalized.includes(',')) return { ok: false, reason: 'comma', message: "Tag names can't contain commas" };
  const taken = tags.find((t) => t.id !== selfId && tagKey(t.name) === tagKey(normalized));
  if (taken) return { ok: false, reason: 'duplicate', message: `A tag named “${taken.name}” already exists` };
  return { ok: true, name: normalized };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Tags by name, ignoring case, then id: the order of the picker and the search Tags menu. */
export function sortTags<T extends Tag>(tags: readonly T[] | undefined): T[] {
  return [...(tags ?? [])].sort((a, b) => compareText(tagKey(a.name), tagKey(b.name)) || compareText(a.name, b.name) || compareText(a.id, b.id));
}

/** The tag with this name, ignoring case and extra spaces. */
export function findTagByName<T extends Tag>(tags: readonly T[] | undefined, name: string): T | undefined {
  const key = tagKey(name);
  return key === '' ? undefined : (tags ?? []).find((t) => tagKey(t.name) === key);
}

/** The picker's list while typing: tags whose name contains the text, ignoring case. Empty text lists every tag. */
export function tagsMatching<T extends Tag>(tags: readonly T[] | undefined, text: string): T[] {
  const key = tagKey(text);
  return sortTags(tags).filter((t) => tagKey(t.name).includes(key));
}

/** A tag attached to a task, with when it was attached. */
export interface TagLink {
  tag: Tag;
  attachedAt: string;
}

/**
 * A task's tags in the order they were added, which is the order of its chips. Tags attached at the
 * same moment (a seed, or `--tags a,b`) fall back to name, then id, so every device agrees.
 */
export function orderTaskTags(links: readonly TagLink[]): Tag[] {
  return [...links]
    .sort(
      (a, b) =>
        compareText(a.attachedAt, b.attachedAt) || compareText(tagKey(a.tag.name), tagKey(b.tag.name)) || compareText(a.tag.name, b.tag.name) || compareText(a.tag.id, b.tag.id),
    )
    .map((l) => ({ id: l.tag.id, name: l.tag.name }));
}

/** Chips shown in a desktop row: the first `max`, then how many more. Phone rows show none. */
export function tagChips(tags: readonly Tag[] | undefined, max = 2): { visible: Tag[]; overflow: number } {
  const list = tags ?? [];
  return { visible: list.slice(0, max), overflow: Math.max(0, list.length - max) };
}

/** Whether a task has every one of these tags. No tags selected matches everything. */
export function hasAllTags(task: Pick<Task, 'tags'>, tagIds: readonly string[]): boolean {
  if (tagIds.length === 0) return true;
  const have = new Set((task.tags ?? []).map((t) => t.id));
  return tagIds.every((id) => have.has(id));
}

/** Search's tag filter: a task must have every selected tag (AND). The database's `search_tasks` does the same. */
export function filterByTags<T extends Pick<Task, 'tags'>>(tasks: readonly T[], tagIds: readonly string[]): T[] {
  return tasks.filter((t) => hasAllTags(t, tagIds));
}

export interface TagCount {
  tag: Tag;
  count: number;
}

/**
 * How many tasks each tag is on, in the order of `sortTags`. Counts only tasks still to do: not
 * completed and not in Trash, which are the ones a search lists by default.
 */
export function tagCounts(tasks: readonly Pick<Task, 'tags' | 'completedAt' | 'deletedAt'>[], tags: readonly Tag[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.completedAt || task.deletedAt) continue;
    for (const tag of task.tags ?? []) counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
  }
  return sortTags(tags).map((tag) => ({ tag: { id: tag.id, name: tag.name }, count: counts.get(tag.id) ?? 0 }));
}

/** One write to the tag list itself. */
export type TagChange = { kind: 'create'; tag: Tag } | { kind: 'rename'; id: string; name: string } | { kind: 'delete'; id: string };

/** One write to the tags on a task: a single link row, so edits on two devices merge. */
export type TaskTagChange = { kind: 'attach'; tag: Tag } | { kind: 'detach'; tagId: string };

function requireTag(tags: readonly Tag[], id: string): Tag {
  const found = tags.find((t) => t.id === id);
  if (!found) throw new Error(`No tag ${id}`);
  return found;
}

/**
 * The tag for a name, and the write that makes it. A name that matches an existing tag (ignoring case)
 * uses that tag and needs no write; throws for a name that isn't allowed.
 */
export function planCreateTag(tags: readonly Tag[], input: { id: string; name: string }): { tag: Tag; change: TagChange | null } {
  const existing = findTagByName(tags, input.name);
  if (existing) return { tag: existing, change: null };
  const checked = checkTagName(input.name, tags);
  if (!checked.ok) throw new Error(checked.message);
  const tag = { id: input.id, name: checked.name };
  return { tag, change: { kind: 'create', tag } };
}

/** Renames a tag everywhere at once. Returns null when the name wouldn't change; throws for a name that isn't allowed. */
export function planRenameTag(tags: readonly Tag[], id: string, name: string): TagChange | null {
  const current = requireTag(tags, id);
  const checked = checkTagName(name, tags, id);
  if (!checked.ok) throw new Error(checked.message);
  return checked.name === current.name ? null : { kind: 'rename', id, name: checked.name };
}

/** Deleting a tag removes it from every task. The tasks themselves stay. */
export function planDeleteTag(tags: readonly Tag[], id: string): TagChange {
  requireTag(tags, id);
  return { kind: 'delete', id };
}

/** The tag list and every task's tags after one change. Doesn't modify its input. */
export function applyTagChange<T extends Task>(state: { tags: readonly Tag[]; tasks: readonly T[] }, change: TagChange): { tags: Tag[]; tasks: T[] } {
  switch (change.kind) {
    case 'create':
      return { tags: sortTags([...state.tags.filter((t) => t.id !== change.tag.id), change.tag]), tasks: [...state.tasks] };
    case 'rename':
      return {
        tags: sortTags(state.tags.map((t) => (t.id === change.id ? { ...t, name: change.name } : t))),
        tasks: state.tasks.map((task) => (task.tags?.some((t) => t.id === change.id) ? { ...task, tags: task.tags.map((t) => (t.id === change.id ? { ...t, name: change.name } : t)) } : task)),
      };
    case 'delete':
      return {
        tags: state.tags.filter((t) => t.id !== change.id),
        tasks: state.tasks.map((task) => (task.tags?.some((t) => t.id === change.id) ? { ...task, tags: task.tags.filter((t) => t.id !== change.id) } : task)),
      };
  }
}

/** A task's tags after attaching or detaching one. A new tag goes last, after the ones already there. */
export function applyTaskTagChange(tags: readonly Tag[] | undefined, change: TaskTagChange): Tag[] {
  const list = tags ?? [];
  if (change.kind === 'detach') return list.filter((t) => t.id !== change.tagId);
  return list.some((t) => t.id === change.tag.id) ? [...list] : [...list, { id: change.tag.id, name: change.tag.name }];
}

/** Turns the text of `--tags a,b` into names: split on commas, trimmed, no empties, and no repeats ignoring case (the first wins). */
export function parseTagList(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of text.split(',')) {
    const name = normalizeTagName(part);
    if (name === null || seen.has(tagKey(name))) continue;
    seen.add(tagKey(name));
    names.push(name);
  }
  return names;
}

export interface TagSetPlan {
  /** Tags that don't exist yet, to create first. */
  creates: Extract<TagChange, { kind: 'create' }>[];
  /** Links to add, in order. */
  attach: Tag[];
  /** Ids of links to remove. */
  detach: string[];
  /** The task's tags afterwards: the ones kept in their order, then the new ones in list order. */
  tags: Tag[];
}

/**
 * Makes a task's tags exactly `names`: reuses existing tags (ignoring case), creates the rest, keeps the
 * links already there in place and adds new ones after them. Throws for a name that isn't allowed.
 */
export function planTaskTags(catalog: readonly Tag[], current: readonly Tag[] | undefined, names: readonly string[], newId: () => string): TagSetPlan {
  const creates: TagSetPlan['creates'] = [];
  let known = [...catalog];
  const wanted: Tag[] = [];
  for (const name of names) {
    const planned = planCreateTag(known, { id: findTagByName(known, name) ? '' : newId(), name });
    if (planned.change) {
      creates.push(planned.change as TagSetPlan['creates'][number]);
      known = [...known, planned.tag];
    }
    if (!wanted.some((t) => t.id === planned.tag.id)) wanted.push(planned.tag);
  }
  const have = current ?? [];
  const keep = have.filter((t) => wanted.some((w) => w.id === t.id));
  const attach = wanted.filter((w) => !have.some((t) => t.id === w.id));
  return {
    creates,
    attach,
    detach: have.filter((t) => !wanted.some((w) => w.id === t.id)).map((t) => t.id),
    tags: [...keep, ...attach].map((t) => ({ id: t.id, name: t.name })),
  };
}

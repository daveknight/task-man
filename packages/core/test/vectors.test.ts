import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  actionsFor,
  upcomingDropPresets,
  planDrop,
  planUpcomingDrop,
  positionEffect,
  shouldPurge,
  type ActionGroup,
  type Preset,
  buildBoard,
  isValidSortKey,
  keyBetween,
  applySubtaskChange,
  applyTagChange,
  applyTaskTagChange,
  checkTagName,
  filterByTags,
  normalizeTagName,
  orderTaskTags,
  parseTagList,
  planCreateTag,
  planDeleteTag,
  planRenameTag,
  planTaskTags,
  sortTags,
  tagChips,
  tagCounts,
  tagsMatching,
  type Tag,
  type TagChange,
  type TagLink,
  type TaskTagChange,
  nextWeekdayOnOrAfter,
  normalizeSubtaskTitle,
  planAddSubtask,
  planEditSubtask,
  planMoveSubtask,
  planRemoveSubtask,
  resetSubtasks,
  resolveDate,
  changeStatus,
  resume,
  sectionFor,
  setDueDate,
  validateTask,
  waitUntil,
  waitingStateFor,
  weekdayOf,
  sortSubtasks,
  subtaskCount,
  type Subtask,
  type SubtaskChange,
  type Task,
  type UpcomingDropChoice,
  type Weekday,
} from '../src/index.ts';

function load<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../vectors/${name}`, import.meta.url), 'utf8')) as T;
}

/** Applies the vector defaults: omitted fields are null and status is open. */
function taskFrom(fields: Partial<Task>, id = 'task'): Task {
  return {
    id,
    title: 'Task',
    status: 'open',
    startDate: null,
    hideUntil: null,
    dueDate: null,
    completedAt: null,
    completedOn: null,
    deletedAt: null,
    deletedOn: null,
    flagged: false,
    ...fields,
  };
}

describe('sections.json', () => {
  const { cases } = load<{
    cases: { name: string; today: string; task: Partial<Task>; expect: { section: string; waitingState?: string } }[];
  }>('sections.json');

  it.each(cases)('$name', ({ today, task, expect: expected }) => {
    const t = taskFrom(task);
    const section = sectionFor(t, today);
    expect(section).toBe(expected.section);
    if (section === 'waiting') expect(waitingStateFor(t, today)).toBe(expected.waitingState);
    else expect(expected.waitingState).toBeUndefined();
  });
});

describe('board-order.json', () => {
  const { cases } = load<{
    cases: {
      name: string;
      today: string;
      options: { showCompleted?: boolean; showTrash?: boolean };
      tasks: (Partial<Task> & { id: string })[];
      positions: Record<string, string>;
      expect: Record<string, string[]>;
    }[];
  }>('board-order.json');

  it.each(cases)('$name', ({ today, options, tasks, positions, expect: expected }) => {
    const board = buildBoard(
      tasks.map((t) => taskFrom(t, t.id)),
      new Map(Object.entries(positions)),
      today,
      options,
    );
    const actual: Record<string, string[]> = {};
    for (const section of board.sections) {
      actual[section.id] = section.tasks.map((t) => t.id);
      if (section.id === 'waiting') actual.waiting_later = (section.later ?? []).map((t) => t.id);
      expect(section.count).toBe(section.tasks.length + (section.later?.length ?? 0));
    }
    expect(actual).toEqual(expected);
  });
});

describe('dates.json', () => {
  const vectors = load<{
    resolveDate: { today: string; input: string; expect?: string; expectError?: boolean }[];
    weekdayOf: { date: string; expect: string }[];
    nextWeekdayOnOrAfter: { date: string; weekdays: Weekday[]; expect: string }[];
  }>('dates.json');

  it.each(vectors.resolveDate)('resolveDate($input) on $today', ({ today, input, expect: expected, expectError }) => {
    if (expectError) expect(() => resolveDate(input, today)).toThrow();
    else expect(resolveDate(input, today)).toBe(expected);
  });

  it.each(vectors.weekdayOf)('weekdayOf($date)', ({ date, expect: expected }) => {
    expect(weekdayOf(date)).toBe(expected);
  });

  it.each(vectors.nextWeekdayOnOrAfter)('nextWeekdayOnOrAfter($date, $weekdays)', ({ date, weekdays, expect: expected }) => {
    expect(nextWeekdayOnOrAfter(date, weekdays)).toBe(expected);
  });
});

describe('sort-keys.json', () => {
  const vectors = load<{
    keyBetween: { a: string | null; b: string | null; expect?: string; expectError?: boolean }[];
    isValidSortKey: { key: string; expect: boolean }[];
  }>('sort-keys.json');

  it.each(vectors.keyBetween)('keyBetween($a, $b)', ({ a, b, expect: expected, expectError }) => {
    if (expectError) expect(() => keyBetween(a, b)).toThrow();
    else expect(keyBetween(a, b)).toBe(expected);
  });

  it.each(vectors.isValidSortKey)('isValidSortKey($key)', ({ key, expect: expected }) => {
    expect(isValidSortKey(key)).toBe(expected);
  });
});

describe('transitions.json', () => {
  const vectors = load<{
    setDueDate: {
      name: string;
      task: Partial<Task>;
      dueDate: string | null;
      expect: Partial<Task>;
      startMoved: { from: string; to: string } | null;
    }[];
    waitUntil: { name: string; task: Partial<Task>; hideUntil: string | null; expect: Partial<Task> }[];
    changeStatus: { name: string; task: Partial<Task>; to: Task['status']; expect: Partial<Task> }[];
  }>('transitions.json');

  it.each(vectors.setDueDate)('setDueDate: $name', ({ task, dueDate, expect: expected, startMoved }) => {
    const result = setDueDate(taskFrom(task), dueDate);
    expect(result.task).toMatchObject(expected);
    expect(result.startMoved ?? null).toEqual(startMoved);
  });

  it.each(vectors.waitUntil)('waitUntil: $name', ({ task, hideUntil, expect: expected }) => {
    expect(waitUntil(taskFrom(task), hideUntil)).toMatchObject(expected);
  });

  it.each(vectors.changeStatus)('changeStatus: $name', ({ task, to, expect: expected }) => {
    const t = taskFrom(task);
    const changed = changeStatus(t, to);
    expect(changed).toMatchObject(expected);
    expect(validateTask(changed)).toEqual([]);
    if (to === 'in_progress') expect(resume(t)).toEqual(changed);
  });
});

function presetSummary(p: Preset): string {
  const e = p.effect;
  if (e.kind === 'skip') return 'skip';
  if (e.kind === 'set') return `${p.id}:${e.field}=${e.date ?? 'null'}`;
  return `${p.id}:pick ${e.field}${e.min ? ` >=${e.min}` : ''}${e.max ? ` <=${e.max}` : ''}`;
}

function groupSummary(g: ActionGroup): string[] {
  if (g.presets.length === 0) {
    const e = g.effect!;
    return [`${g.id} -> ${e.kind === 'status' ? `status:${e.to}` : e.kind}`];
  }
  return [g.id, ...g.presets.map(presetSummary)];
}

describe('actions.json', () => {
  const { cases } = load<{
    cases: { name: string; today: string; context?: { recurring?: boolean }; task: Partial<Task>; expect: unknown }[];
  }>('actions.json');

  it.each(cases)('$name', ({ today, context, task, expect: expected }) => {
    const a = actionsFor(taskFrom(task), today, context);
    expect({
      placement: a.placement,
      date: a.date ? groupSummary(a.date) : null,
      state: a.state.map(groupSummary),
      delete: a.delete.id,
    }).toEqual(expected);
  });
});

describe('actions.json labels', () => {
  const { labels } = load<{
    labels: { name: string; today: string; context?: { recurring?: boolean }; task: Partial<Task>; expect: Record<string, Record<string, string>> }[];
  }>('actions.json');

  it.each(labels)('$name', ({ today, context, task, expect: expected }) => {
    const a = actionsFor(taskFrom(task), today, context);
    const groups = [a.date, ...a.state].filter((g) => g !== null);
    const actual = Object.fromEntries(
      Object.keys(expected).map((id) => [id, Object.fromEntries((groups.find((g) => g.id === id)?.presets ?? []).map((p) => [p.id, p.label]))]),
    );
    expect(actual).toEqual(expected);
  });
});

describe('actions.json upcomingDrop', () => {
  const { upcomingDrop } = load<{ upcomingDrop: { name: string; today: string; task: Partial<Task>; expect: string[] }[] }>('actions.json');

  it.each(upcomingDrop)('$name', ({ today, task, expect: expected }) => {
    expect(upcomingDropPresets(taskFrom(task), today).map(presetSummary)).toEqual(expected);
  });
});

describe('positions.json', () => {
  const vectors = load<{
    positionEffect: { name: string; today: string; before: Partial<Task>; after: Partial<Task>; expect: string }[];
    planDrop: { name: string; order: string[]; positions: Record<string, string>; moving: string; index: number; expect: { writes: string[]; order: string[] } }[];
    planUpcomingDrop: { name: string; today: string; task: Partial<Task>; choice?: UpcomingDropChoice; expect: unknown }[];
    shouldPurge: { name: string; today: string; task: Partial<Task>; expect: boolean }[];
  }>('positions.json');

  it.each(vectors.positionEffect)('positionEffect: $name', ({ today, before, after, expect: expected }) => {
    expect(positionEffect(taskFrom(before), taskFrom(after), today)).toBe(expected);
  });

  it.each(vectors.planDrop)('planDrop: $name', ({ order, positions, moving, index, expect: expected }) => {
    const map = new Map(Object.entries(positions));
    const writes = planDrop(
      order.map((id) => ({ id })),
      map,
      moving,
      index,
      keyBetween,
    );
    expect(writes.map((w) => w.taskId)).toEqual(expected.writes);
    for (const w of writes) map.set(w.taskId, w.sortKey);
    const board = buildBoard(
      [...order, moving].map((id, i) => taskFrom({ createdAt: `2026-11-01T00:00:0${i}Z` }, id)),
      map,
      '2026-11-18',
    );
    expect(board.sections.find((s) => s.id === 'ready')!.tasks.map((t) => t.id)).toEqual(expected.order);
  });

  it.each(vectors.planUpcomingDrop)('planUpcomingDrop: $name', ({ today, task, choice, expect: expected }) => {
    const result = planUpcomingDrop(taskFrom(task), today, choice);
    if (result.decision) {
      expect({ decision: result.decision }).toEqual(expected);
      return;
    }
    expect({ task: { status: result.task.status, dueDate: result.task.dueDate, hideUntil: result.task.hideUntil ?? null }, presets: result.presets.map((p) => p.id) }).toEqual(expected);
  });

  it.each(vectors.shouldPurge)('shouldPurge: $name', ({ today, task, expect: expected }) => {
    expect(shouldPurge(taskFrom(task), today)).toBe(expected);
  });
});

describe('validate.json', () => {
  const { cases } = load<{ cases: { name: string; task: Partial<Task>; expect: string[] }[] }>('validate.json');

  it.each(cases)('$name', ({ task, expect: expected }) => {
    expect(validateTask(task).map((i) => i.field).sort()).toEqual([...expected].sort());
  });
});

describe('subtasks.json', () => {
  type Case = { name: string; subtasks: Subtask[]; expectError?: boolean };
  const vectors = load<{
    sortSubtasks: (Case & { expect: string[] })[];
    subtaskCount: (Case & { expect: { done: number; total: number } })[];
    normalizeSubtaskTitle: { input: string; expect: string | null }[];
    planAdd: (Case & { id: string; title: string; expect?: { subtask: Subtask; order: string[] } })[];
    planEdit: (Case & { id: string; fields: { title?: string; done?: boolean }; expect?: SubtaskChange | null })[];
    planMove: (Case & { id: string; toIndex: number; expect?: { sortKey: string; order: string[]; done?: string[] } | null })[];
    planRemove: (Case & { id: string; expect?: { order: string[] } })[];
    resetSubtasks: (Case & { expect: Subtask[] })[];
  }>('subtasks.json');
  const ids = (list: Subtask[]) => list.map((s) => s.id);

  it.each(vectors.sortSubtasks)('sortSubtasks: $name', ({ subtasks, expect: expected }) => {
    expect(ids(sortSubtasks(subtasks))).toEqual(expected);
  });

  it.each(vectors.subtaskCount)('subtaskCount: $name', ({ subtasks, expect: expected }) => {
    expect(subtaskCount(subtasks)).toEqual(expected);
  });

  it.each(vectors.normalizeSubtaskTitle)('normalizeSubtaskTitle($input)', ({ input, expect: expected }) => {
    expect(normalizeSubtaskTitle(input)).toBe(expected);
  });

  it.each(vectors.planAdd)('planAdd: $name', ({ subtasks, id, title, expect: expected, expectError }) => {
    if (expectError) return expect(() => planAddSubtask(subtasks, { id, title }, keyBetween)).toThrow();
    const change = planAddSubtask(subtasks, { id, title }, keyBetween);
    expect(change).toEqual({ kind: 'add', subtask: expected!.subtask });
    expect(ids(applySubtaskChange(subtasks, change))).toEqual(expected!.order);
  });

  it.each(vectors.planEdit)('planEdit: $name', ({ subtasks, id, fields, expect: expected, expectError }) => {
    if (expectError) return expect(() => planEditSubtask(subtasks, id, fields)).toThrow();
    const change = planEditSubtask(subtasks, id, fields);
    expect(change).toEqual(expected);
    if (change) expect(ids(applySubtaskChange(subtasks, change))).toEqual(ids(sortSubtasks(subtasks)));
  });

  it.each(vectors.planMove)('planMove: $name', ({ subtasks, id, toIndex, expect: expected, expectError }) => {
    if (expectError) return expect(() => planMoveSubtask(subtasks, id, toIndex, keyBetween)).toThrow();
    const change = planMoveSubtask(subtasks, id, toIndex, keyBetween);
    if (expected === null) return expect(change).toBeNull();
    expect(change).toEqual({ kind: 'move', id, sortKey: expected!.sortKey });
    const after = applySubtaskChange(subtasks, change!);
    expect(ids(after)).toEqual(expected!.order);
    expect(after.filter((s) => s.done).map((s) => s.id)).toEqual(expected!.done ?? after.filter((s) => s.done).map((s) => s.id));
  });

  it.each(vectors.planRemove)('planRemove: $name', ({ subtasks, id, expect: expected, expectError }) => {
    if (expectError) return expect(() => planRemoveSubtask(subtasks, id)).toThrow();
    expect(ids(applySubtaskChange(subtasks, planRemoveSubtask(subtasks, id)))).toEqual(expected!.order);
  });

  it.each(vectors.resetSubtasks)('resetSubtasks: $name', ({ subtasks, expect: expected }) => {
    expect(resetSubtasks(subtasks)).toEqual(expected);
  });
});

describe('tags.json', () => {
  type TaskSpec = { id: string; tags?: string[]; completedAt?: string; deletedAt?: string };
  const tag = (id: string): Tag => ({ id, name: id });
  const tasksFrom = (specs: TaskSpec[]) => specs.map((t) => ({ ...taskFrom({ completedAt: t.completedAt ?? null, deletedAt: t.deletedAt ?? null }, t.id), ...(t.tags ? { tags: t.tags.map(tag) } : {}) }));
  const label = (t: Tag) => `${t.id}:${t.name}`;
  const vectors = load<{
    normalizeTagName: { input: string; expect: string | null }[];
    checkTagName: { name: string; tags: Tag[]; selfId?: string; input: string; expect: { ok: boolean; name?: string; reason?: string } }[];
    sortTags: { name: string; tags: Tag[]; expect: string[] }[];
    tagsMatching: { name: string; tags: Tag[]; text: string; expect: string[] }[];
    orderTaskTags: { name: string; links: TagLink[]; expect: string[] }[];
    tagChips: { name: string; tags: string[]; max?: number; expect: { visible: string[]; overflow: number } }[];
    filterByTags: { name: string; tasks: TaskSpec[]; tagIds: string[]; expect: string[] }[];
    tagCounts: { name: string; tags: Tag[]; tasks: TaskSpec[]; expect: [string, number][] }[];
    planCreateTag: { name: string; tags: Tag[]; id: string; input: string; expect?: { tag: Tag; change: TagChange | null }; expectError?: boolean }[];
    planRenameTag: { name: string; tags: Tag[]; id: string; input: string; expect?: TagChange | null; expectError?: boolean }[];
    applyTagChange: { name: string; tags: Tag[]; tasks: TaskSpec[]; change: TagChange; expect: { tags: string[]; tasks: Record<string, string[]> } }[];
    applyTaskTagChange: { name: string; tags?: Tag[]; change: TaskTagChange; expect: string[] }[];
    parseTagList: { input: string; expect: string[] }[];
    planTaskTags: { name: string; catalog: Tag[]; current: Tag[]; names: string[]; ids: string[]; expect?: { creates: string[]; attach: string[]; detach: string[]; tags: string[] }; expectError?: boolean }[];
  }>('tags.json');

  it.each(vectors.normalizeTagName)('normalizeTagName($input)', ({ input, expect: expected }) => {
    expect(normalizeTagName(input)).toBe(expected);
  });

  it.each(vectors.checkTagName)('checkTagName: $name', ({ tags, selfId, input, expect: expected }) => {
    const result = checkTagName(input, tags, selfId);
    expect(result.ok).toBe(expected.ok);
    if (result.ok) expect(result.name).toBe(expected.name);
    else expect(result.reason).toBe(expected.reason);
  });

  it.each(vectors.sortTags)('sortTags: $name', ({ tags, expect: expected }) => {
    expect(sortTags(tags).map((t) => t.id)).toEqual(expected);
  });

  it.each(vectors.tagsMatching)('tagsMatching: $name', ({ tags, text, expect: expected }) => {
    expect(tagsMatching(tags, text).map((t) => t.id)).toEqual(expected);
  });

  it.each(vectors.orderTaskTags)('orderTaskTags: $name', ({ links, expect: expected }) => {
    expect(orderTaskTags(links).map((t) => t.id)).toEqual(expected);
  });

  it.each(vectors.tagChips)('tagChips: $name', ({ tags, max, expect: expected }) => {
    const chips = tagChips(tags.map(tag), max);
    expect({ visible: chips.visible.map((t) => t.id), overflow: chips.overflow }).toEqual(expected);
  });

  it.each(vectors.filterByTags)('filterByTags: $name', ({ tasks, tagIds, expect: expected }) => {
    expect(filterByTags(tasksFrom(tasks), tagIds).map((t) => t.id)).toEqual(expected);
  });

  it.each(vectors.tagCounts)('tagCounts: $name', ({ tags, tasks, expect: expected }) => {
    expect(tagCounts(tasksFrom(tasks), tags).map((c) => [c.tag.id, c.count])).toEqual(expected);
  });

  it.each(vectors.planCreateTag)('planCreateTag: $name', ({ tags, id, input, expect: expected, expectError }) => {
    if (expectError) return expect(() => planCreateTag(tags, { id, name: input })).toThrow();
    expect(planCreateTag(tags, { id, name: input })).toEqual(expected);
  });

  it.each(vectors.planRenameTag)('planRenameTag: $name', ({ tags, id, input, expect: expected, expectError }) => {
    if (expectError) return expect(() => planRenameTag(tags, id, input)).toThrow();
    expect(planRenameTag(tags, id, input)).toEqual(expected);
  });

  it.each(vectors.applyTagChange)('applyTagChange: $name', ({ tags, tasks, change, expect: expected }) => {
    const result = applyTagChange({ tags, tasks: tasksFrom(tasks).map((t, i) => ({ ...t, tags: tasks[i]!.tags?.map((id) => tags.find((g) => g.id === id)!) })) }, change);
    expect(result.tags.map(label)).toEqual(expected.tags);
    expect(Object.fromEntries(result.tasks.map((t) => [t.id, (t.tags ?? []).map(label)]))).toEqual(expected.tasks);
  });

  it('planDeleteTag refuses a tag that does not exist', () => {
    expect(planDeleteTag([{ id: 'a', name: 'a' }], 'a')).toEqual({ kind: 'delete', id: 'a' });
    expect(() => planDeleteTag([], 'a')).toThrow();
  });

  it.each(vectors.applyTaskTagChange)('applyTaskTagChange: $name', ({ tags, change, expect: expected }) => {
    expect(applyTaskTagChange(tags, change).map(label)).toEqual(expected);
  });

  it.each(vectors.parseTagList)('parseTagList($input)', ({ input, expect: expected }) => {
    expect(parseTagList(input)).toEqual(expected);
  });

  it.each(vectors.planTaskTags)('planTaskTags: $name', ({ catalog, current, names, ids, expect: expected, expectError }) => {
    const queue = [...ids];
    const newId = () => queue.shift() ?? 'unexpected-id';
    if (expectError) return expect(() => planTaskTags(catalog, current, names, newId)).toThrow();
    const plan = planTaskTags(catalog, current, names, newId);
    expect({ creates: plan.creates.map((c) => label(c.tag)), attach: plan.attach.map(label), detach: plan.detach, tags: plan.tags.map(label) }).toEqual(expected);
    expect(queue).toEqual([]);
  });
});

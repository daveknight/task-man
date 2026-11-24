/**
 * Tags against local Supabase, through the same functions the CLI commands call: add and edit with
 * --tags, the tags list and its counts, rename and delete, search by tag name and by selected tags (AND),
 * how the search function treats other users, backups, and what deleting a task or tag does.
 */
import { filterByTags } from '@app/core';
import { loadSnapshot } from '@app/data';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportAll, importAll } from '../src/backup.ts';
import { loadBoard } from '../src/commands.ts';
import { connection, DEV_USER } from '../src/config.ts';
import { adminClient, devUserId } from '../src/db.ts';
import { addTask, deleteTag, deleteTask, doneTask, editTask, listTags, renameTag, restoreTask, search, showTask, type Context } from '../src/tasks.ts';

const MARK = `tg${Date.now().toString(36)}`;
const TODAY = '2026-11-18';

const conn = connection();
const admin = adminClient();
let ctx: Context;
let dev: SupabaseClient;
let otherId: string;
const taskIds: string[] = [];

const name = (label: string) => `${MARK} ${label}`;
/** A tag name that belongs to this run, so it can't collide with other data and is removed afterwards. */
const tag = (label: string) => `${MARK}-${label}`;
const names = (tags: { name: string }[] | undefined) => (tags ?? []).map((t) => t.name);

async function add(label: string, tags?: string[]) {
  const result = await addTask(ctx, name(label), { tags: tags?.join(',') });
  taskIds.push(result.task.id);
  return result;
}

const show = (label: string) => showTask(ctx, name(label));
const found = async (query: string, tags: string[] = [], options: { completed?: boolean } = {}) =>
  (await search(ctx, query, { ...options, tags })).map((r) => r.task.title.replace(`${MARK} `, '')).sort();

beforeAll(async () => {
  ctx = { scope: { db: admin, userId: await devUserId(admin) }, today: TODAY, now: '2026-11-18T12:00:00.000Z' };
  dev = createClient(conn.url, conn.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await dev.auth.signInWithPassword(DEV_USER);
  if (error) throw error;
  const users = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = users.data.users.find((u) => u.email === 'other-user@example.com');
  if (existing) otherId = existing.id;
  else {
    const res = await admin.auth.admin.createUser({ email: 'other-user@example.com', password: 'other-password', email_confirm: true });
    if (res.error) throw res.error;
    otherId = res.data.user.id;
  }
});

afterAll(async () => {
  await admin.from('tasks').delete().in('id', taskIds);
  await admin.from('tombstones').delete().in('id', taskIds);
  const { data } = await admin.from('tags').select('id').like('name', `${MARK}%`);
  const tagIds = (data ?? []).map((t) => t.id as string);
  await admin.from('tags').delete().in('id', tagIds);
  await admin.from('tombstones').delete().in('id', tagIds);
});

describe('add --tags', () => {
  it('creates the tags, keeps the order given, and saves them', async () => {
    const { task } = await add('ordered', [tag('kids'), ` ${tag('outdoors')} `, tag('home')]);
    expect(names(task.tags)).toEqual([tag('kids'), tag('outdoors'), tag('home')]);
    expect(names((await show('ordered')).task.tags)).toEqual([tag('kids'), tag('outdoors'), tag('home')]);
  });

  it('reuses an existing tag whatever the capitalization, and never makes a duplicate', async () => {
    await add('first', [tag('Errands')]);
    const { task } = await add('second', [tag('ERRANDS')]);
    expect(names(task.tags)).toEqual([tag('Errands')]);
    const all = await listTags(ctx);
    expect(all.filter((t) => t.name.toLowerCase() === tag('errands').toLowerCase())).toHaveLength(1);
  });

  it('refuses a bad name and saves nothing', async () => {
    await expect(addTask(ctx, name('bad'), { tags: `${tag('ok')},${'x'.repeat(31)}` })).rejects.toThrow('at most 30');
    expect((await admin.from('tasks').select('id').eq('title', name('bad'))).data).toEqual([]);
    expect((await admin.from('tags').select('id').eq('name', tag('ok'))).data).toEqual([]);
  });

  it('a task with none has an empty list', async () => {
    const { task } = await add('plain');
    expect(task.tags).toEqual([]);
  });
});

describe('edit --tags', () => {
  it('sets exactly these tags, keeping the ones already there in place and adding new ones after', async () => {
    await add('edit', [tag('a'), tag('b'), tag('c')]);
    const result = await editTask(ctx, name('edit'), { tags: `${tag('c')},${tag('d')},${tag('a')}` });
    expect(names(result.task.tags)).toEqual([tag('a'), tag('c'), tag('d')]);
    expect(names((await show('edit')).task.tags)).toEqual([tag('a'), tag('c'), tag('d')]);
  });

  it('an empty list clears them, and the tags themselves stay', async () => {
    await add('clear', [tag('lonely')]);
    await editTask(ctx, name('clear'), { tags: '' });
    expect((await show('clear')).task.tags).toEqual([]);
    expect((await listTags(ctx)).some((t) => t.name === tag('lonely'))).toBe(true);
  });

  it('is left alone when --tags is not given', async () => {
    await add('untouched', [tag('keep')]);
    await editTask(ctx, name('untouched'), { flag: true });
    expect(names((await show('untouched')).task.tags)).toEqual([tag('keep')]);
  });

  it("can't change the tags of a task in Trash", async () => {
    const { task } = await add('trashed', [tag('t1')]);
    await deleteTask(ctx, task.id, false);
    await expect(editTask(ctx, task.id, { tags: tag('t2') })).rejects.toThrow('Trash');
    await restoreTask(ctx, task.id);
    await editTask(ctx, task.id, { tags: tag('t2') });
    expect(names((await show('trashed')).task.tags)).toEqual([tag('t2')]);
  });
});

describe('tags list', () => {
  it('counts the tasks still to do that have each tag: not completed, not in Trash', async () => {
    await add('c1', [tag('counted')]);
    await add('c2', [tag('counted')]);
    const done = await add('c3', [tag('counted')]);
    const gone = await add('c4', [tag('counted')]);
    await doneTask(ctx, done.task.id);
    await deleteTask(ctx, gone.task.id, false);
    expect((await listTags(ctx)).find((t) => t.name === tag('counted'))?.count).toBe(2);
  });

  it('lists by name, ignoring case', async () => {
    const list = (await listTags(ctx)).map((t) => t.name.toLowerCase());
    expect(list).toEqual([...list].sort());
  });
});

describe('rename and delete', () => {
  it('renaming shows on every task that has the tag, and in search', async () => {
    await add('r1', [tag('old'), tag('other')]);
    await add('r2', [tag('old')]);
    const renamed = await renameTag(ctx, tag('OLD'), tag('new'));
    expect(renamed.tag.name).toBe(tag('new'));
    expect(names((await show('r1')).task.tags)).toEqual([tag('new'), tag('other')]);
    expect(names((await show('r2')).task.tags)).toEqual([tag('new')]);
    expect(await found(MARK, [tag('new')])).toEqual(['r1', 'r2']);
  });

  it('only the capitalization can change, and the same name is a no-op', async () => {
    await add('case', [tag('lower')]);
    expect((await renameTag(ctx, tag('lower'), tag('Lower'))).tag.name).toBe(tag('Lower'));
    expect(names((await show('case')).task.tags)).toEqual([tag('Lower')]);
    const same = await renameTag(ctx, tag('lower'), `  ${tag('Lower')} `);
    expect(same.tag.name).toBe(tag('Lower'));
  });

  it('refuses a name another tag has, an empty name and a comma', async () => {
    await add('taken', [tag('t-one'), tag('t-two')]);
    await expect(renameTag(ctx, tag('t-one'), tag('T-TWO'))).rejects.toThrow('already exists');
    await expect(renameTag(ctx, tag('t-one'), '  ')).rejects.toThrow('required');
    await expect(renameTag(ctx, tag('t-one'), 'a,b')).rejects.toThrow('commas');
    await expect(renameTag(ctx, tag('nope'), 'x')).rejects.toThrow('No tag named');
    expect(names((await show('taken')).task.tags)).toEqual([tag('t-one'), tag('t-two')]);
  });

  it('deleting removes the tag from every task, keeps the tasks, and leaves a tombstone', async () => {
    const { task } = await add('d1', [tag('doomed'), tag('survivor')]);
    await add('d2', [tag('doomed')]);
    const before = (await admin.from('tags').select('id').eq('name', tag('doomed'))).data![0]!.id as string;
    const result = await deleteTag(ctx, tag('doomed'));
    expect(result.tasks).toBe(2);
    expect(names((await show('d1')).task.tags)).toEqual([tag('survivor')]);
    expect((await show('d2')).task.tags).toEqual([]);
    expect((await listTags(ctx)).some((t) => t.name === tag('doomed'))).toBe(false);
    expect((await admin.from('task_tags').select('tag_id').eq('tag_id', before)).data).toEqual([]);
    expect((await admin.from('tombstones').select('id').eq('id', before)).data).toHaveLength(1);
    expect((await show('d1')).task.id).toBe(task.id);
  });

  it('a tag can be found by an id prefix', async () => {
    await add('prefix', [tag('byid')]);
    const id = (await admin.from('tags').select('id').eq('name', tag('byid'))).data![0]!.id as string;
    expect((await renameTag(ctx, id.slice(0, 8), tag('byid2'))).tag.name).toBe(tag('byid2'));
  });
});

describe('search', () => {
  beforeAll(async () => {
    await add('s-both', [tag('alpha'), tag('beta')]);
    await add('s-alpha', [tag('alpha')]);
    await add('s-beta', [tag('beta'), tag('gamma')]);
    await add('s-none');
    const done = await add('s-done', [tag('alpha'), tag('beta')]);
    await doneTask(ctx, done.task.id);
    const gone = await add('s-trash', [tag('alpha'), tag('beta')]);
    await deleteTask(ctx, gone.task.id, false);
  });

  it('one tag: every task that has it', async () => {
    expect(await found('', [tag('alpha')])).toEqual(['s-alpha', 's-both']);
  });

  it('two tags are AND: a task must have both', async () => {
    expect(await found('', [tag('alpha'), tag('beta')])).toEqual(['s-both']);
    expect(await found('', [tag('beta'), tag('alpha')])).toEqual(['s-both']);
  });

  it('the filter and the query both apply', async () => {
    expect(await found('s-beta', [tag('beta')])).toEqual(['s-beta']);
    expect(await found('s-alpha', [tag('beta')])).toEqual([]);
  });

  it('includes completed tasks on request, and never Trash', async () => {
    expect(await found('', [tag('alpha'), tag('beta')], { completed: true })).toEqual(['s-both', 's-done']);
  });

  it('finds tasks by the text of a tag name', async () => {
    expect(await found(tag('gam'))).toEqual(['s-beta']);
    expect(await found(tag('ALPH'))).toEqual(['s-alpha', 's-both']);
  });

  it('matches what core says for the same filter', async () => {
    const snapshot = await loadSnapshot(ctx.scope);
    const ids = ['alpha', 'beta'].map((l) => snapshot.tags.find((t) => t.name === tag(l))!.id);
    const viaCore = filterByTags(
      snapshot.tasks.filter((t) => t.title.startsWith(MARK) && !t.completedAt && !t.deletedAt),
      ids,
    ).map((t) => t.title.replace(`${MARK} `, ''));
    expect(viaCore.sort()).toEqual(await found('', [tag('alpha'), tag('beta')]));
  });

  it('results carry their tags in order', async () => {
    const [hit] = await search(ctx, name('s-beta'), {});
    expect(names(hit?.task.tags)).toEqual([tag('beta'), tag('gamma')]);
  });

  it('an unknown tag is an error, not an empty list', async () => {
    await expect(search(ctx, '', { tags: [tag('nothing-like-it')] })).rejects.toThrow('No tag named');
  });

  it('still answers the old three-argument call', async () => {
    const { data, error } = await dev.rpc('search_tasks', { query: name('s-alpha'), include_completed: false, flagged_only: false });
    expect(error).toBeNull();
    expect((data as unknown[]).length).toBe(1);
  });

  it("never lists another user's tasks, even when given their tag", async () => {
    const task = await admin.from('tasks').insert({ user_id: otherId, title: name('theirs') }).select('id').single();
    const theirTag = await admin.from('tags').insert({ user_id: otherId, name: tag('theirs') }).select('id').single();
    await admin.from('task_tags').insert({ user_id: otherId, task_id: task.data!.id, tag_id: theirTag.data!.id });
    try {
      const { data } = await dev.rpc('search_tasks', { query: '', include_completed: true, flagged_only: false, tag_ids: [theirTag.data!.id] });
      expect(data).toEqual([]);
      const byName = await dev.rpc('search_tasks', { query: tag('theirs'), include_completed: true, flagged_only: false });
      expect(byName.data).toEqual([]);
    } finally {
      await admin.from('tasks').delete().eq('id', task.data!.id);
      await admin.from('tombstones').delete().eq('id', task.data!.id);
      await admin.from('tags').delete().eq('id', theirTag.data!.id);
      await admin.from('tombstones').delete().eq('id', theirTag.data!.id);
    }
  });
});

describe('board, backup and deleting', () => {
  it('board --json carries every task\'s tags', async () => {
    await add('board', [tag('on-board')]);
    const board = await loadBoard(admin, ctx.scope.userId, { today: TODAY, completed: true, trash: true });
    const mine = board.sections.flatMap((s) => [...s.tasks, ...(s.later ?? [])]).find((t) => t.title === name('board'))!;
    expect(names(mine.tags)).toEqual([tag('on-board')]);
  });

  it('export includes tags and links, and import restores them in order', async () => {
    const { task } = await add('backup', [tag('first'), tag('second')]);
    const backup = await exportAll(ctx.scope);
    const links = (backup.task_tags ?? []).filter((l) => l.task_id === task.id);
    expect(links).toHaveLength(2);
    expect((backup.tags ?? []).map((t) => t.name)).toEqual(expect.arrayContaining([tag('first'), tag('second')]));

    await admin.from('tasks').delete().eq('id', task.id);
    await admin.from('tags').delete().in('name', [tag('first'), tag('second')]);
    await importAll(
      ctx.scope,
      { ...backup, tasks: backup.tasks.filter((t) => t.id === task.id), positions: [], subtasks: [], tags: (backup.tags ?? []).filter((t) => [tag('first'), tag('second')].includes(t.name)), task_tags: links },
      false,
    );
    expect(names((await show('backup')).task.tags)).toEqual([tag('first'), tag('second')]);
  });

  it('a backup from before tags still imports', async () => {
    const backup = await exportAll(ctx.scope);
    const older = { ...backup };
    delete older.tags;
    delete older.task_tags;
    await importAll(ctx.scope, { ...older, tasks: [], positions: [], subtasks: [] }, false);
  });

  it('deleting a task for good removes its links but not its tags', async () => {
    const { task } = await add('forever', [tag('stays')]);
    await deleteTask(ctx, task.id, false);
    await deleteTask(ctx, task.id, true);
    expect((await admin.from('task_tags').select('tag_id').eq('task_id', task.id)).data).toEqual([]);
    expect((await listTags(ctx)).some((t) => t.name === tag('stays'))).toBe(true);
  });
});

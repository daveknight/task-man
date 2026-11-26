/**
 * Files in Supabase Storage: private to the signed-in user, capped at 50 MB and 1 GB,
 * and removed through the Storage API (a SQL delete is refused, so the row queues the path).
 */
import { FILE_BYTE_LIMIT, STORAGE_BYTE_LIMIT, attachmentPath } from '@app/core';
import { deleteForever, drainFileDeletions, pendingFileDeletions, storageUsed } from '@app/data';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connection, DEV_USER } from '../src/config.ts';
import { adminClient, devUserId } from '../src/db.ts';

const OTHER_USER = { email: 'files-other@example.com', password: 'other-password' };
const BUCKET = 'attachments';

const conn = connection();
const admin = adminClient();
const sql = postgres(conn.dbUrl, { max: 1, onnotice: () => {} });

let devId: string;
let otherId: string;
let dev: SupabaseClient;
let other: SupabaseClient;
const taskIds: string[] = [];

async function signedIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(conn.url, conn.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function ensureUser(email: string, password: string): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = data.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const res = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (res.error) throw res.error;
  return res.data.user.id;
}

async function addTask(client: SupabaseClient, title = 'File task') {
  const res = await client.from('tasks').insert({ title }).select('id').single();
  if (res.error) throw res.error;
  taskIds.push(res.data.id);
  return res.data.id as string;
}

async function putFile(client: SupabaseClient, userId: string, taskId: string, contents: Uint8Array, filename: string, mime: string) {
  const id = crypto.randomUUID();
  const path = attachmentPath(userId, taskId, id);
  const uploaded = await client.storage.from(BUCKET).upload(path, contents, { contentType: mime, upsert: false });
  return { id, path, uploaded };
}

beforeAll(async () => {
  devId = await devUserId(admin);
  otherId = await ensureUser(OTHER_USER.email, OTHER_USER.password);
  dev = await signedIn(DEV_USER.email, DEV_USER.password);
  other = await signedIn(OTHER_USER.email, OTHER_USER.password);
});

afterEach(async () => {
  const ids = taskIds.splice(0);
  if (ids.length === 0) return;
  await admin.from('tasks').delete().in('id', ids);
  await drainFileDeletions({ db: admin, userId: devId });
  await drainFileDeletions({ db: admin, userId: otherId });
  await admin.from('tombstones').delete().in('id', ids);
  await admin.from('tombstones').delete().eq('user_id', devId).eq('entity', 'attachment');
});

afterAll(async () => {
  if (taskIds.length > 0) await admin.from('tasks').delete().in('id', taskIds);
  await drainFileDeletions({ db: admin, userId: devId }).catch(() => {});
  await drainFileDeletions({ db: admin, userId: otherId }).catch(() => {});
  await admin.from('tombstones').delete().eq('user_id', otherId);
  if (taskIds.length > 0) await admin.from('tombstones').delete().in('id', taskIds);
  await sql.end();
});

describe('storage bucket', () => {
  it('is private and caps a file at 50 MB', async () => {
    const rows = await sql<{ public: boolean; file_size_limit: string }[]>`
      select public, file_size_limit from storage.buckets where id = 'attachments'`;
    expect(rows).toEqual([{ public: false, file_size_limit: String(FILE_BYTE_LIMIT) }]);
  });
});

describe('row-level security for files', () => {
  it('stores a file for the signed-in user and hides it from everyone else', async () => {
    const taskId = await addTask(dev);
    const body = new TextEncoder().encode('hello');
    const { id, path, uploaded } = await putFile(dev, devId, taskId, body, 'notes.txt', 'text/plain');
    expect(uploaded.error).toBeNull();

    const inserted = await dev
      .from('attachments')
      .insert({ id, task_id: taskId, storage_path: path, filename: 'notes.txt', mime: 'text/plain', bytes: body.byteLength })
      .select('user_id,bytes')
      .single();
    expect(inserted.error).toBeNull();
    expect(inserted.data!.user_id).toBe(devId);
    expect(Number(inserted.data!.bytes)).toBe(body.byteLength);

    expect((await other.from('attachments').select('id').eq('id', id)).data).toEqual([]);
    expect((await other.storage.from(BUCKET).download(path)).data).toBeNull();
    expect((await other.from('attachments').delete().eq('id', id).select()).data).toEqual([]);

    const forgedPath = attachmentPath(devId, taskId, crypto.randomUUID());
    const forged = await other.storage.from(BUCKET).upload(forgedPath, body, { contentType: 'text/plain' });
    expect(forged.error).not.toBeNull();

    const anon = createClient(conn.url, conn.anonKey, { auth: { persistSession: false } });
    expect((await anon.from('attachments').select('id')).data ?? []).toEqual([]);
    expect((await anon.storage.from(BUCKET).download(path)).data).toBeNull();

    const still = await dev.storage.from(BUCKET).download(path);
    expect(still.error).toBeNull();
    expect(new TextDecoder().decode(await still.data!.arrayBuffer())).toBe('hello');
  });

  it("won't attach a file to someone else's task or claim the wrong size", async () => {
    const taskId = await addTask(dev);
    const body = new TextEncoder().encode('hello');
    const { id, path, uploaded } = await putFile(dev, devId, taskId, body, 'notes.txt', 'text/plain');
    expect(uploaded.error).toBeNull();

    const crossed = await other.from('attachments').insert({
      id: crypto.randomUUID(),
      task_id: taskId,
      storage_path: attachmentPath(otherId, taskId, crypto.randomUUID()),
      filename: 'x.txt',
      mime: 'text/plain',
      bytes: 1,
    });
    expect(crossed.error).not.toBeNull();

    const mismatch = await dev.from('attachments').insert({
      id,
      task_id: taskId,
      storage_path: path,
      filename: 'notes.txt',
      mime: 'text/plain',
      bytes: body.byteLength + 1,
    });
    expect(mismatch.error?.message).toMatch(/does not match/);

    const missing = await dev.from('attachments').insert({
      id: crypto.randomUUID(),
      task_id: taskId,
      storage_path: attachmentPath(devId, taskId, crypto.randomUUID()),
      filename: 'gone.txt',
      mime: 'text/plain',
      bytes: 1,
    });
    expect(missing.error?.message).toMatch(/missing from storage/);

    const tooBig = await dev.from('attachments').insert({
      id,
      task_id: taskId,
      storage_path: path,
      filename: 'notes.txt',
      mime: 'text/plain',
      bytes: FILE_BYTE_LIMIT + 1,
    });
    expect(tooBig.error).not.toBeNull();
    // The upload landed and the row did not, so the object is not queued with the task.
    await dev.storage.from(BUCKET).remove([path]);
  });

  it('refuses another byte once the user is at 1 GB', async () => {
    const taskId = await addTask(dev);
    const body = new TextEncoder().encode('x');
    const { id, path, uploaded } = await putFile(dev, devId, taskId, body, 'pad.bin', 'application/octet-stream');
    expect(uploaded.error).toBeNull();
    const inserted = await dev.from('attachments').insert({
      id,
      task_id: taskId,
      storage_path: path,
      filename: 'pad.bin',
      mime: 'application/octet-stream',
      bytes: body.byteLength,
    });
    expect(inserted.error).toBeNull();

    // The per-file check would refuse a 1 GB row, so lift it for this one row, point the
    // object at that size, and put the check back. The second file is a normal one.
    const used = await storageUsed({ db: dev, userId: devId });
    const target = STORAGE_BYTE_LIMIT - (used - body.byteLength);
    await sql`alter table public.attachments drop constraint attachments_bytes_check`;
    try {
      await sql`update storage.objects set metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json({ size: target })} where name = ${path}`;
      const grown = await dev.from('attachments').update({ bytes: target }).eq('id', id).select('bytes').single();
      expect(grown.error).toBeNull();

      const extraId = crypto.randomUUID();
      const extraPath = attachmentPath(devId, taskId, extraId);
      const extra = await dev.storage.from(BUCKET).upload(extraPath, body, { contentType: 'application/octet-stream' });
      expect(extra.error).toBeNull();
      const blocked = await dev.from('attachments').insert({
        id: extraId,
        task_id: taskId,
        storage_path: extraPath,
        filename: 'one-more.bin',
        mime: 'application/octet-stream',
        bytes: body.byteLength,
      });
      expect(blocked.error?.message).toMatch(/Storage is full/);
      await dev.storage.from(BUCKET).remove([extraPath]);
    } finally {
      await sql`update storage.objects set metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json({ size: body.byteLength })} where name = ${path}`;
      await sql`update public.attachments set bytes = ${body.byteLength} where id = ${id}`;
      await sql`
        alter table public.attachments add constraint attachments_bytes_check check (bytes > 0 and bytes <= 52428800)`;
    }
  });
});

describe('removing files', () => {
  it('queues the object when the row goes, and the Storage API then deletes it', async () => {
    const taskId = await addTask(dev);
    const body = new TextEncoder().encode('gone');
    const { id, path, uploaded } = await putFile(dev, devId, taskId, body, 'gone.txt', 'text/plain');
    expect(uploaded.error).toBeNull();
    const inserted = await dev.from('attachments').insert({
      id,
      task_id: taskId,
      storage_path: path,
      filename: 'gone.txt',
      mime: 'text/plain',
      bytes: body.byteLength,
    });
    expect(inserted.error).toBeNull();
    const used = await storageUsed({ db: dev, userId: devId });

    const removed = await dev.from('attachments').delete().eq('id', id).select('id');
    expect(removed.error).toBeNull();
    expect(await pendingFileDeletions({ db: dev, userId: devId })).toContain(path);
    expect((await other.from('file_deletions').select('storage_path').eq('storage_path', path)).data).toEqual([]);

    const tomb = await dev.from('tombstones').select('entity').eq('id', id).single();
    expect(tomb.data!.entity).toBe('attachment');

    await drainFileDeletions({ db: dev, userId: devId });
    expect(await pendingFileDeletions({ db: dev, userId: devId })).not.toContain(path);
    expect((await dev.storage.from(BUCKET).download(path)).data).toBeNull();
    expect(await storageUsed({ db: dev, userId: devId })).toBe(used - body.byteLength);
  });

  it('drops the files when the task is deleted forever', async () => {
    const taskId = await addTask(dev);
    const body = new TextEncoder().encode('with-task');
    const { id, path, uploaded } = await putFile(dev, devId, taskId, body, 'with.txt', 'text/plain');
    expect(uploaded.error).toBeNull();
    expect((await dev.from('attachments').insert({ id, task_id: taskId, storage_path: path, filename: 'with.txt', mime: 'text/plain', bytes: body.byteLength })).error).toBeNull();

    await deleteForever({ db: dev, userId: devId }, taskId);
    expect((await dev.from('attachments').select('id').eq('task_id', taskId)).data).toEqual([]);
    expect((await dev.storage.from(BUCKET).download(path)).data).toBeNull();
    expect(await pendingFileDeletions({ db: dev, userId: devId })).not.toContain(path);
  });

  it('the 30-day purge queues the file, and draining removes the bytes', async () => {
    const taskId = await addTask(dev, 'old file task');
    await admin.from('tasks').update({ deleted_at: '2026-10-01T12:00:00Z', deleted_on: '2026-10-01' }).eq('id', taskId);
    const body = new TextEncoder().encode('purged');
    const { id, path, uploaded } = await putFile(dev, devId, taskId, body, 'old.txt', 'text/plain');
    expect(uploaded.error).toBeNull();
    expect((await dev.from('attachments').insert({ id, task_id: taskId, storage_path: path, filename: 'old.txt', mime: 'text/plain', bytes: body.byteLength })).error).toBeNull();

    const purged = await sql<{ purge_trash: string }[]>`select public.purge_trash(${'2026-11-18'}::date, ${devId}::uuid)`;
    expect(purged.map((row) => row.purge_trash)).toContain(taskId);
    expect(await pendingFileDeletions({ db: dev, userId: devId })).toContain(path);
    // Still in Storage until something calls the API. The daily job stops at the queue.
    expect((await dev.storage.from(BUCKET).download(path)).data).not.toBeNull();

    await drainFileDeletions({ db: dev, userId: devId });
    expect((await dev.storage.from(BUCKET).download(path)).data).toBeNull();
    expect(await pendingFileDeletions({ db: dev, userId: devId })).not.toContain(path);
  });
});

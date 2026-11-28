import {
  ATTACHMENTS_BUCKET,
  attachmentPath,
  cleanFilename,
  uploadBlock,
  type Attachment,
} from '@app/core';
import type { Scope } from './repo.ts';

const COLUMNS = 'id,task_id,storage_path,filename,mime,bytes,created_at';
const REMOVE_CHUNK = 100;

interface AttachmentRow {
  id: string;
  task_id: string;
  storage_path: string;
  filename: string;
  mime: string;
  bytes: number | string;
  created_at: string;
}

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export function attachmentFromRow(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    taskId: row.task_id,
    storagePath: row.storage_path,
    filename: row.filename,
    mime: row.mime,
    bytes: Number(row.bytes),
    createdAt: row.created_at,
  };
}

/** An attachment plus a short-lived URL the sheet uses for the thumbnail and for saving the file. */
export interface AttachmentFile extends Attachment {
  url: string | null;
}

/** Bytes this user already has stored. */
export async function storageUsed({ db, userId }: Scope): Promise<number> {
  const { data, error } = await db.rpc('storage_used', { only_user: userId });
  fail('storage used', error);
  return Number(data ?? 0);
}

/** Files on one task, oldest first, each with a signed URL when Storage could make one. */
export async function listAttachmentFiles(scope: Scope, taskId: string): Promise<AttachmentFile[]> {
  const { db, userId } = scope;
  const { data, error } = await db
    .from('attachments')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .order('created_at')
    .order('id')
    .returns<AttachmentRow[]>();
  fail('list files', error);
  const rows = (data ?? []).map(attachmentFromRow);
  if (rows.length === 0) return [];
  const signed = await db.storage.from(ATTACHMENTS_BUCKET).createSignedUrls(
    rows.map((row) => row.storagePath),
    60 * 60,
  );
  fail('sign files', signed.error);
  const urls = new Map((signed.data ?? []).filter((item) => item.path && item.signedUrl).map((item) => [item.path!, item.signedUrl]));
  return rows.map((row) => ({ ...row, url: urls.get(row.storagePath) ?? null }));
}

/**
 * Upload one file and record it. The caller has already downscaled photos.
 * A failed row write removes the object it just uploaded, so a rejected file
 * doesn't count toward the storage cap.
 */
export async function addAttachment(scope: Scope, taskId: string, file: { name: string; type: string; size: number; body: Blob | ArrayBuffer | Uint8Array }): Promise<Attachment> {
  const { db, userId } = scope;
  const bytes = file.size;
  const block = uploadBlock(await storageUsed(scope), bytes);
  if (block) throw new Error(block);

  const id = crypto.randomUUID();
  const path = attachmentPath(userId, taskId, id);
  const filename = cleanFilename(file.name);
  const mime = file.type.trim() || 'application/octet-stream';
  const uploaded = await db.storage.from(ATTACHMENTS_BUCKET).upload(path, file.body, { contentType: mime, upsert: false });
  if (uploaded.error) throw new Error(uploadMessage(uploaded.error.message));

  const inserted = await db
    .from('attachments')
    .insert({ id, user_id: userId, task_id: taskId, storage_path: path, filename, mime, bytes })
    .select(COLUMNS)
    .single<AttachmentRow>();
  if (inserted.error) {
    await db.storage.from(ATTACHMENTS_BUCKET).remove([path]);
    throw new Error(uploadMessage(inserted.error.message));
  }
  return attachmentFromRow(inserted.data);
}

/**
 * The stored bytes of one object. `scope.db` sends the caller's access token,
 * so the storage select policy is what allows the read.
 */
export async function downloadAttachment({ db }: Scope, storagePath: string): Promise<Uint8Array> {
  const downloaded = await db.storage.from(ATTACHMENTS_BUCKET).download(storagePath);
  if (downloaded.error || !downloaded.data) {
    throw new Error(downloaded.error ? `download file: ${downloaded.error.message}` : "Couldn't read the file.");
  }
  return new Uint8Array(await downloaded.data.arrayBuffer());
}

function uploadMessage(message: string): string {
  if (/over 50 MB|payload too large|exceeded the maximum/i.test(message)) return 'This file is over 50 MB.';
  if (/Storage is full/i.test(message)) return 'Storage is full. 1 GB is the limit.';
  if (/missing from storage|size does not match/i.test(message)) return "Couldn't save the file. Try it again.";
  return message;
}

/** Remove one file. The row goes first, which queues the object; the queue is then drained. */
export async function removeAttachment(scope: Scope, attachmentId: string): Promise<void> {
  const { db, userId } = scope;
  fail('remove file', (await db.from('attachments').delete().eq('user_id', userId).eq('id', attachmentId)).error);
  await drainFileDeletions(scope);
}

/**
 * Delete every object in this user's queue through the Storage API, then drop the queue rows.
 * Direct SQL deletes are refused by Storage, because they would leave the bytes behind.
 */
export async function drainFileDeletions({ db, userId }: Scope): Promise<void> {
  const paths: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('file_deletions').select('storage_path').eq('user_id', userId).order('storage_path').range(from, from + 999);
    fail('list files to remove', error);
    const page = (data ?? []).map((row: { storage_path: string }) => row.storage_path);
    paths.push(...page);
    if (page.length < 1000) break;
  }
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    fail('remove files', (await db.storage.from(ATTACHMENTS_BUCKET).remove(chunk)).error);
    fail('clear removed files', (await db.from('file_deletions').delete().eq('user_id', userId).in('storage_path', chunk)).error);
  }
}

/** For tests and the CLI: the objects still waiting to be removed. */
export async function pendingFileDeletions({ db, userId }: Scope): Promise<string[]> {
  const { data, error } = await db.from('file_deletions').select('storage_path').eq('user_id', userId).order('storage_path');
  fail('list files to remove', error);
  return (data ?? []).map((row: { storage_path: string }) => row.storage_path);
}

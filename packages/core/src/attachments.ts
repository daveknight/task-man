/**
 * Files on a task. The byte limits are Supabase Free's: 50 MiB per file and 1 GiB
 * of storage, which the product calls 50 MB and 1 GB. Photos are downscaled before
 * upload; the web app does that in the browser, using the sizes below.
 */

/** 50 MiB. The storage bucket rejects anything larger, and so does the table. */
export const FILE_BYTE_LIMIT = 50 * 1024 * 1024;

/** 1 GiB, counted from the bytes recorded on each file. */
export const STORAGE_BYTE_LIMIT = 1024 * 1024 * 1024;

/** Longest side of a photo after downscaling. */
export const PHOTO_MAX_EDGE = 2048;

/** JPEG quality used when a photo is re-encoded. */
export const PHOTO_JPEG_QUALITY = 0.8;

/** Private Supabase Storage bucket. Paths are `{userId}/{taskId}/{attachmentId}`. */
export const ATTACHMENTS_BUCKET = 'attachments';

/** A file kept on a task. The bytes live in Storage; this is the row the app reads. */
export interface Attachment {
  id: string;
  taskId: string;
  storagePath: string;
  filename: string;
  mime: string;
  bytes: number;
  createdAt: string;
}

const PHOTO_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp', 'image/heic', 'image/heif']);

/** Photos the browser is asked to downscale. GIF stays as-is so an animation isn't flattened. */
export function isPhotoMime(mime: string): boolean {
  return PHOTO_MIME.has(mime.toLowerCase());
}

/** Images the sheet can show as a thumbnail. HEIC is not one of them until it has been re-encoded. */
export function isPreviewableImage(mime: string): boolean {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'].includes(mime.toLowerCase());
}

/** Object key for one file. The filename stays in the row, not in the path. */
export function attachmentPath(userId: string, taskId: string, attachmentId: string): string {
  return `${userId}/${taskId}/${attachmentId}`;
}

/**
 * The filename stored on the row: no directory, no control characters, at most 255
 * characters (what the column allows). An empty name becomes "file".
 */
export function cleanFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const clipped = Array.from(cleaned).slice(0, 255).join('').trim();
  return clipped.length > 0 ? clipped : 'file';
}

/** Fit a photo inside a square of `maxEdge`, keeping its shape. Already-small photos stay put. */
export function fitInside(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (width < 1 || height < 1 || edge <= maxEdge) return { width: Math.max(1, width), height: Math.max(1, height) };
  const scale = maxEdge / edge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Why a file can't be stored, or null when it can. `usedBytes` is what this user
 * already has. A file of exactly the limit is allowed; one byte over is not.
 */
export function uploadBlock(usedBytes: number, fileBytes: number): string | null {
  if (!Number.isFinite(fileBytes) || fileBytes <= 0) return 'This file is empty.';
  if (fileBytes > FILE_BYTE_LIMIT) return 'This file is over 50 MB.';
  if (!Number.isFinite(usedBytes) || usedBytes < 0) return 'Storage is full. 1 GB is the limit.';
  if (usedBytes + fileBytes > STORAGE_BYTE_LIMIT) return 'Storage is full. 1 GB is the limit.';
  return null;
}

function trimQuantity(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

/** A short size: "12 KB", "1.5 MB". Units step at 1024. */
export function formatBytes(bytes: number): string {
  const n = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) {
    const kb = n / 1024;
    return `${kb >= 10 ? Math.round(kb) : trimQuantity(kb)} KB`;
  }
  if (n < 1024 * 1024 * 1024) {
    const mb = n / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : trimQuantity(mb)} MB`;
  }
  const gb = n / (1024 * 1024 * 1024);
  return `${gb >= 10 ? Math.round(gb) : trimQuantity(gb)} GB`;
}

/** The Settings line, for example "12 MB of 1 GB". */
export function formatStorage(usedBytes: number): string {
  return `${formatBytes(usedBytes)} of 1 GB`;
}

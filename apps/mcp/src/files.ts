import { FILE_BYTE_LIMIT } from '@app/core';

const MIME_LIMIT = 127;

/**
 * Decode the base64 file bytes a tool call sends. Rejects a data URL, an empty
 * file, and anything over the 50 MB storage cap before the bytes are stored.
 */
export function decodeFileData(data: string): Uint8Array {
  let trimmed = data.trim().replace(/\s+/g, '');
  if (trimmed.toLowerCase().startsWith('data:')) {
    throw new Error('Send the file bytes as base64, without a data: prefix.');
  }
  trimmed = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  if (trimmed.includes('=')) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(trimmed) || trimmed.length % 4 !== 0) {
      throw new Error('File data must be base64.');
    }
  } else {
    if (!/^[A-Za-z0-9+/]*$/.test(trimmed)) throw new Error('File data must be base64.');
    const mod = trimmed.length % 4;
    if (mod === 1) throw new Error('File data must be base64.');
    if (mod > 0) trimmed += '='.repeat(4 - mod);
  }
  const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
  const bytes = (trimmed.length / 4) * 3 - padding;
  if (bytes <= 0) throw new Error('This file is empty.');
  if (bytes > FILE_BYTE_LIMIT) throw new Error('This file is over 50 MB.');
  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.byteLength !== bytes) throw new Error('File data must be base64.');
  return Uint8Array.from(decoded);
}

/** The media type stored on the row. An empty type becomes application/octet-stream. */
export function fileMediaType(type: string | undefined): string {
  const raw = type ?? '';
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw new Error('That file type is not valid.');
  const mime = raw.trim() || 'application/octet-stream';
  if (mime.length > MIME_LIMIT) throw new Error('That file type is not valid.');
  return mime;
}

export interface NamedFile {
  id: string;
  filename: string;
}

/**
 * One file on a task. An id, or an id prefix of at least 4 characters, is chosen
 * before a file name. Two files with the same name have to be named by id.
 */
export function pickFile<T extends NamedFile>(files: readonly T[], ref: string): T {
  const key = ref.trim();
  if (!key) throw new Error('Name the file to download.');
  const idKey = key.toLowerCase();
  const byId = /^[0-9a-f-]+$/.test(idKey) ? files.filter((file) => file.id === idKey || (idKey.length >= 4 && file.id.startsWith(idKey))) : [];
  if (byId.length === 1) return byId[0]!;
  if (byId.length > 1) throw new Error(`"${ref}" matches ${byId.length} files; use more of the id`);
  const byName = files.filter((file) => file.filename === key);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new Error(`"${key}" matches ${byName.length} files. Pass one of these ids: ${byName.map((file) => file.id).join(', ')}`);
  }
  throw new Error(`No file named "${key}" on this task`);
}

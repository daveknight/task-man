import { describe, expect, it } from 'vitest';
import {
  FILE_BYTE_LIMIT,
  PHOTO_MAX_EDGE,
  STORAGE_BYTE_LIMIT,
  attachmentPath,
  cleanFilename,
  fitInside,
  formatBytes,
  formatStorage,
  isPhotoMime,
  isPreviewableImage,
  uploadBlock,
} from '../src/index.ts';

describe('attachment limits', () => {
  it('allows a file at exactly 50 MB and storage at exactly 1 GB', () => {
    expect(uploadBlock(0, FILE_BYTE_LIMIT)).toBeNull();
    expect(uploadBlock(STORAGE_BYTE_LIMIT - FILE_BYTE_LIMIT, FILE_BYTE_LIMIT)).toBeNull();
    expect(uploadBlock(STORAGE_BYTE_LIMIT - 1, 1)).toBeNull();
  });

  it('refuses an empty file, a file over 50 MB, and a file that would pass 1 GB', () => {
    expect(uploadBlock(0, 0)).toBe('This file is empty.');
    expect(uploadBlock(0, -1)).toBe('This file is empty.');
    expect(uploadBlock(0, FILE_BYTE_LIMIT + 1)).toBe('This file is over 50 MB.');
    expect(uploadBlock(STORAGE_BYTE_LIMIT, 1)).toBe('Storage is full. 1 GB is the limit.');
    expect(uploadBlock(STORAGE_BYTE_LIMIT - 10, 11)).toBe('Storage is full. 1 GB is the limit.');
  });
});

describe('photo sizing', () => {
  it('shrinks the long edge to 2048 and keeps the shape', () => {
    expect(fitInside(3200, 1800, PHOTO_MAX_EDGE)).toEqual({ width: 2048, height: 1152 });
    expect(fitInside(1800, 3200, PHOTO_MAX_EDGE)).toEqual({ width: 1152, height: 2048 });
  });

  it('leaves a photo that already fits alone', () => {
    expect(fitInside(800, 600, PHOTO_MAX_EDGE)).toEqual({ width: 800, height: 600 });
    expect(fitInside(PHOTO_MAX_EDGE, 100, PHOTO_MAX_EDGE)).toEqual({ width: PHOTO_MAX_EDGE, height: 100 });
  });

  it('treats camera photos as downscaleable and gif as something to leave alone', () => {
    expect(isPhotoMime('image/jpeg')).toBe(true);
    expect(isPhotoMime('image/heic')).toBe(true);
    expect(isPhotoMime('image/gif')).toBe(false);
    expect(isPhotoMime('application/pdf')).toBe(false);
    for (const mime of ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']) {
      expect(isPreviewableImage(mime)).toBe(true);
      expect(isPreviewableImage(mime.toUpperCase())).toBe(true);
    }
    for (const mime of ['image/heic', 'image/heif', 'image/jpg', 'image/svg+xml', 'application/pdf', 'text/plain']) {
      expect(isPreviewableImage(mime)).toBe(false);
    }
  });
});

describe('attachment names', () => {
  it('builds a path the storage policy can check, without the filename', () => {
    expect(attachmentPath('user', 'task', 'file')).toBe('user/task/file');
  });

  it('drops directories and control characters, and fills in an empty name', () => {
    expect(cleanFilename('folder/My notes.txt')).toBe('My notes.txt');
    expect(cleanFilename('..\\secret.pdf')).toBe('secret.pdf');
    expect(cleanFilename('a\u0000b.txt')).toBe('ab.txt');
    expect(cleanFilename('   ')).toBe('file');
    expect(cleanFilename('')).toBe('file');
    expect(Array.from(cleanFilename(`${'é'.repeat(300)}.png`)).length).toBe(255);
  });
});

describe('formatStorage', () => {
  it('reads in the unit that fits, and names the 1 GB cap', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
    expect(formatStorage(0)).toBe('0 B of 1 GB');
    expect(formatStorage(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB of 1 GB');
  });
});

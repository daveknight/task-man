import { describe, expect, it } from 'vitest';
import { decodeFileData, fileMediaType, pickFile } from '../src/files.ts';

describe('file bytes', () => {
  it('decodes standard, unpadded, wrapped, and url-safe base64', () => {
    const bytes = Uint8Array.from([0, 255, 10, 13, 0x80]);
    const padded = Buffer.from(bytes).toString('base64');
    expect(Array.from(decodeFileData(padded))).toEqual(Array.from(bytes));
    expect(Array.from(decodeFileData(padded.replace(/=+$/, '')))).toEqual(Array.from(bytes));
    expect(Array.from(decodeFileData(padded.replace(/\+/g, '-').replace(/\//g, '_')))).toEqual(Array.from(bytes));
    expect(Array.from(decodeFileData(`  ${padded.slice(0, 4)}\n${padded.slice(4)}  `))).toEqual(Array.from(bytes));
  });

  it('refuses a data URL, empty bytes, and text that is not base64', () => {
    expect(() => decodeFileData('')).toThrow(/empty/i);
    expect(() => decodeFileData('data:text/plain;base64,aGVsbG8=')).toThrow(/data:/i);
    expect(() => decodeFileData('hello')).toThrow(/base64/);
    expect(() => decodeFileData('A===')).toThrow(/base64/);
    expect(() => decodeFileData('abcde')).toThrow(/base64/);
  });

  it('fills in an empty media type and refuses one that will not fit the column', () => {
    expect(fileMediaType(undefined)).toBe('application/octet-stream');
    expect(fileMediaType('  text/plain  ')).toBe('text/plain');
    expect(() => fileMediaType('x'.repeat(128))).toThrow(/not valid/);
    expect(() => fileMediaType('text/plain\n')).toThrow(/not valid/);
  });
});

describe('picking a file', () => {
  const files = [
    { id: 'aaaa1111-0000-0000-0000-000000000001', filename: 'notes.txt' },
    { id: 'bbbb2222-0000-0000-0000-000000000002', filename: 'notes.txt' },
    { id: 'cccc3333-0000-0000-0000-000000000003', filename: 'photo.jpg' },
    { id: 'cccc4444-0000-0000-0000-000000000004', filename: 'other.jpg' },
  ];

  it('uses an id before a shared file name', () => {
    expect(pickFile(files, 'cccc3333').filename).toBe('photo.jpg');
    expect(pickFile(files, files[2]!.id).id).toBe(files[2]!.id);
    expect(pickFile(files, 'photo.jpg').filename).toBe('photo.jpg');
  });

  it('asks for an id when two files share a name, and misses an unknown name', () => {
    expect(() => pickFile(files, 'notes.txt')).toThrow(/aaaa1111/);
    expect(() => pickFile(files, 'cccc')).toThrow(/use more of the id/);
    expect(() => pickFile(files, 'missing.txt')).toThrow(/No file named/);
    expect(() => pickFile(files, '   ')).toThrow(/Name the file/);
  });
});

import { describe, expect, it } from 'vitest';
import { listEnter, listIndent } from '../src/index.ts';

/** `|` marks the caret. */
function at(text: string): [string, number] {
  return [text.replace('|', ''), text.indexOf('|')];
}

function show(edit: { value: string; caret: number } | null): string | null {
  return edit ? edit.value.slice(0, edit.caret) + '|' + edit.value.slice(edit.caret) : null;
}

describe('listEnter', () => {
  it.each([
    ['- milk|', '- milk\n- |'],
    ['* milk|', '* milk\n* |'],
    ['1. milk|', '1. milk\n2. |'],
    ['  - nested|', '  - nested\n  - |'],
    ['- mi|lk', '- mi\n- |lk'],
    ['a\n- milk\n- |', 'a\n- milk\n|'],
    ['plain text|', null],
    ['-not a list|', null],
  ])('%s', (input, expected) => {
    expect(show(listEnter(...at(input)))).toBe(expected);
  });
});

describe('listIndent', () => {
  it.each([
    ['- milk|', false, '  - milk|'],
    ['  - milk|', true, '- milk|'],
    ['- milk|', true, '- milk|'],
    ['milk|', false, null],
  ] as const)('%s (outdent: %s)', (input, outdent, expected) => {
    expect(show(listIndent(...at(input), outdent))).toBe(expected);
  });
});

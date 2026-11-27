import { describe, expect, it } from 'vitest';
import { repeatFlagsIfSet, tagsFlag, toSubtaskEdits } from '../src/args.ts';

describe('tool arguments', () => {
  it('turns a repeat object into the CLI flags', () => {
    expect(repeatFlagsIfSet({ repeat: 'weekly', interval: 2, startOffset: 1, ends: 'count:4' })).toEqual({
      repeat: 'weekly',
      interval: '2',
      startOffset: '1',
      ends: 'count:4',
    });
    expect(repeatFlagsIfSet({ repeat: 'none' })).toEqual({ repeat: 'none' });
    expect(repeatFlagsIfSet({})).toBeUndefined();
    expect(repeatFlagsIfSet(undefined)).toBeUndefined();
  });

  it('joins tags and maps subtask edits onto the CLI strings', () => {
    expect(tagsFlag(['Home', 'Errand'])).toBe('Home,Errand');
    expect(tagsFlag([])).toBe('');
    expect(tagsFlag(undefined)).toBeUndefined();
    expect(
      toSubtaskEdits({
        add: ['Pack the bag'],
        done: ['1'],
        rename: [{ ref: 'Pack', title: 'Pack the small bag' }],
        move: [{ ref: '2', position: 1 }],
      }),
    ).toEqual({
      add: ['Pack the bag'],
      done: ['1'],
      rename: ['Pack=Pack the small bag'],
      move: ['2=1'],
    });
  });
});

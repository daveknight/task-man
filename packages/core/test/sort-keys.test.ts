import { describe, expect, it } from 'vitest';
import { compareSortKeys, isValidSortKey, keyBetween, newSortKey, sortKeysAfter } from '../src/index.ts';

/** A seeded generator so failures reproduce. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('newSortKey', () => {
  it('stays strictly between its neighbours and valid under random inserts', () => {
    const random = seededRandom(42);
    const keys: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const at = Math.floor(random() * (keys.length + 1));
      const key = newSortKey(keys[at - 1] ?? null, keys[at] ?? null, random);
      expect(isValidSortKey(key)).toBe(true);
      keys.splice(at, 0, key);
    }
    const sorted = [...keys].sort(compareSortKeys);
    expect(keys).toEqual(sorted);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives two devices inserting at the same spot different keys', () => {
    const a = newSortKey('a0', 'a1', seededRandom(1));
    const b = newSortKey('a0', 'a1', seededRandom(2));
    expect(a).not.toBe(b);
    for (const k of [a, b]) expect(k > 'a0' && k < 'a1').toBe(true);
  });

  it('works when the plain key would be a prefix of the upper bound', () => {
    expect(keyBetween(null, 'a0V')).toBe('a0');
    const key = newSortKey(null, 'a0V', seededRandom(3));
    expect(key < 'a0V').toBe(true);
    expect(isValidSortKey(key)).toBe(true);
  });

  it('keeps keys short when always inserting at the top', () => {
    let top: string | null = null;
    for (let i = 0; i < 1000; i++) top = newSortKey(null, top);
    expect(top!.length).toBeLessThan(12);
  });
});

describe('sortKeysAfter', () => {
  it('returns increasing keys in file order', () => {
    const keys = sortKeysAfter(60);
    expect(keys).toEqual([...keys].sort(compareSortKeys));
    expect(new Set(keys).size).toBe(60);
  });
});

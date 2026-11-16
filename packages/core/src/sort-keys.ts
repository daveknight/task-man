/**
 * Fractional-index sort keys: strings that sort byte-wise (Postgres `collate "C"`),
 * so a row can always be placed between two others by writing only its own key.
 *
 * A key is an integer part (a head character giving its length, then digits)
 * followed by an optional fraction that never ends in the zero digit.
 * Compare keys with `compareSortKeys`, never `localeCompare`.
 */

export const SORT_KEY_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const ZERO = SORT_KEY_DIGITS[0]!;
const SMALLEST_INTEGER = 'A' + ZERO.repeat(26);

export function compareSortKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  if (a.endsWith(ZERO) || (b !== null && b.endsWith(ZERO))) throw new Error('trailing zero');
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? SORT_KEY_DIGITS.indexOf(a[0]!) : 0;
  const digitB = b !== null ? SORT_KEY_DIGITS.indexOf(b[0]!) : SORT_KEY_DIGITS.length;
  if (digitB - digitA > 1) {
    return SORT_KEY_DIGITS[Math.round(0.5 * (digitA + digitB))]!;
  }
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return SORT_KEY_DIGITS[digitA]! + midpoint(a.slice(1), null);
}

function integerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  if (head >= 'A' && head <= 'Z') return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new Error(`Invalid sort key head: ${head}`);
}

function integerPart(key: string): string {
  const length = integerLength(key[0] ?? '');
  if (length > key.length) throw new Error(`Invalid sort key: ${key}`);
  return key.slice(0, length);
}

export function isValidSortKey(key: string): boolean {
  try {
    if (key === SMALLEST_INTEGER) return false;
    if ([...key].some((c) => !SORT_KEY_DIGITS.includes(c))) return false;
    const int = integerPart(key);
    return !key.slice(int.length).endsWith(ZERO);
  } catch {
    return false;
  }
}

function assertValid(key: string): void {
  if (!isValidSortKey(key)) throw new Error(`Invalid sort key: ${key}`);
}

function incrementInteger(x: string): string | null {
  const [head, ...digits] = x.split('') as [string, ...string[]];
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i--) {
    const d = SORT_KEY_DIGITS.indexOf(digits[i]!) + 1;
    if (d === SORT_KEY_DIGITS.length) {
      digits[i] = ZERO;
    } else {
      digits[i] = SORT_KEY_DIGITS[d]!;
      carry = false;
    }
  }
  if (!carry) return head + digits.join('');
  if (head === 'Z') return 'a' + ZERO;
  if (head === 'z') return null;
  const next = String.fromCharCode(head.charCodeAt(0) + 1);
  if (next > 'a') digits.push(ZERO);
  else digits.pop();
  return next + digits.join('');
}

function decrementInteger(x: string): string | null {
  const [head, ...digits] = x.split('') as [string, ...string[]];
  const last = SORT_KEY_DIGITS[SORT_KEY_DIGITS.length - 1]!;
  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i--) {
    const d = SORT_KEY_DIGITS.indexOf(digits[i]!) - 1;
    if (d === -1) {
      digits[i] = last;
    } else {
      digits[i] = SORT_KEY_DIGITS[d]!;
      borrow = false;
    }
  }
  if (!borrow) return head + digits.join('');
  if (head === 'a') return 'Z' + last;
  if (head === 'A') return null;
  const next = String.fromCharCode(head.charCodeAt(0) - 1);
  if (next < 'Z') digits.push(last);
  else digits.pop();
  return next + digits.join('');
}

/**
 * The deterministic key strictly between `a` and `b` (null means the start or end of the list).
 * Use `newSortKey` for real writes; this exists for the test vectors.
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null) assertValid(a);
  if (b !== null) assertValid(b);
  if (a !== null && b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  if (a === null) {
    if (b === null) return 'a' + ZERO;
    const ib = integerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) return ib + midpoint('', fb);
    if (ib < b) return ib;
    const res = decrementInteger(ib);
    if (res === null) throw new Error('Cannot decrement any more');
    return res;
  }
  if (b === null) {
    const ia = integerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia);
    return i === null ? ia + midpoint(fa, null) : i;
  }
  const ia = integerPart(a);
  const fa = a.slice(ia.length);
  const ib = integerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb);
  const i = incrementInteger(ia);
  if (i === null) throw new Error('Cannot increment any more');
  return i < b ? i : ia + midpoint(fa, null);
}

const SUFFIX_LENGTH = 3;

function randomSuffix(random: () => number): string {
  let out = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    // The last character is never ZERO, so the key stays valid.
    const min = i === SUFFIX_LENGTH - 1 ? 1 : 0;
    out += SORT_KEY_DIGITS[min + Math.floor(random() * (SORT_KEY_DIGITS.length - min))]!;
  }
  return out;
}

/**
 * A key strictly between `a` and `b` with a short random suffix, so two devices
 * inserting at the same spot offline don't produce the same key. Ties that
 * still happen are broken by task id.
 */
export function newSortKey(a: string | null, b: string | null, random: () => number = Math.random): string {
  let lower = a;
  for (let attempt = 0; attempt < 4; attempt++) {
    let base = keyBetween(lower, b);
    if (lower === null && b !== null && b.startsWith(base)) {
      // Step down a whole integer instead of growing the fraction, so repeated top inserts stay short.
      try {
        base = keyBetween(null, base);
      } catch {
        // Already the smallest integer; the fraction has to grow.
      }
    }
    const candidate = base + randomSuffix(random);
    if ((a === null || candidate > a) && (b === null || candidate < b)) return candidate;
    lower = base;
  }
  return keyBetween(a, b);
}

/** `count` increasing keys after `after` (default: an empty list), e.g. for seeding in file order. */
export function sortKeysAfter(count: number, after: string | null = null, random: () => number = Math.random): string[] {
  const keys: string[] = [];
  let previous = after;
  for (let i = 0; i < count; i++) {
    previous = newSortKey(previous, null, random);
    keys.push(previous);
  }
  return keys;
}

import { createHash, randomBytes } from 'node:crypto';

/** RFC 7636 S256. Node's base64url digest has no padding, which is what clients send. */
export function s256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** A verifier the tests (and a hand-run client) can send. 32 bytes is within the 43–128 character rule. */
export function newVerifier(): string {
  return randomBytes(32).toString('base64url');
}

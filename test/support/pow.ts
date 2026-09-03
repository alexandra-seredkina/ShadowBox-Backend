import { createHash } from 'node:crypto';
import { countLeadingZeroBits } from '../../src/modules/identity/domain/pow-challenge.js';

/** Brute force, like the browser worker; only fast with the low test difficulty. */
export function solvePow(prefix: Uint8Array, difficulty: number): string {
  for (let nonce = 0; ; nonce += 1) {
    const digest = createHash('sha256')
      .update(prefix)
      .update(String(nonce), 'utf8')
      .digest();
    if (countLeadingZeroBits(digest) >= difficulty) {
      return String(nonce);
    }
  }
}

/** A nonce that is well-formed but does not reach the difficulty. */
export function findFailingNonce(
  prefix: Uint8Array,
  difficulty: number,
): string {
  for (let nonce = 0; ; nonce += 1) {
    const digest = createHash('sha256')
      .update(prefix)
      .update(String(nonce), 'utf8')
      .digest();
    if (countLeadingZeroBits(digest) < difficulty) {
      return String(nonce);
    }
  }
}

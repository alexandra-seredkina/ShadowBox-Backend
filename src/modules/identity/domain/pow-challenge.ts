import { createHash } from 'node:crypto';
import type { Brand } from '../../../shared/kernel/brand.js';

export const POW_PURPOSES = ['register', 'login'] as const;
export type PowPurpose = (typeof POW_PURPOSES)[number];

export type PowChallengeId = Brand<string, 'PowChallengeId'>;

export const POW_PREFIX_BYTES = 16;
export const POW_TTL_MS = 5 * 60 * 1000;
export const POW_MIN_DIFFICULTY = 1;
export const POW_MAX_DIFFICULTY = 32;

/** Canonical decimal uint64: no sign, no leading zeros. */
const NONCE_PATTERN = /^(?:0|[1-9]\d{0,19})$/;
const MAX_UINT64 = 2n ** 64n - 1n;
const BITS_PER_BYTE = 8;

export interface NewPowChallenge {
  readonly purpose: PowPurpose;
  readonly prefix: Uint8Array;
  readonly difficulty: number;
  readonly expiresAt: Date;
}

export interface PowChallenge extends NewPowChallenge {
  readonly id: PowChallengeId;
}

export interface PowAttempt {
  readonly purpose: PowPurpose;
  readonly nonce: string;
  readonly now: Date;
}

export function createPowChallenge(params: {
  readonly purpose: PowPurpose;
  readonly prefix: Uint8Array;
  readonly difficulty: number;
  readonly now: Date;
}): NewPowChallenge {
  if (params.prefix.length !== POW_PREFIX_BYTES) {
    throw new RangeError(`PoW prefix must be ${POW_PREFIX_BYTES} bytes`);
  }
  if (
    !Number.isInteger(params.difficulty) ||
    params.difficulty < POW_MIN_DIFFICULTY ||
    params.difficulty > POW_MAX_DIFFICULTY
  ) {
    throw new RangeError('PoW difficulty is out of range');
  }
  return {
    purpose: params.purpose,
    prefix: params.prefix,
    difficulty: params.difficulty,
    expiresAt: new Date(params.now.getTime() + POW_TTL_MS),
  };
}

export function countLeadingZeroBits(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    if (byte !== 0) {
      return count + Math.clz32(byte) - (32 - BITS_PER_BYTE);
    }
    count += BITS_PER_BYTE;
  }
  return count;
}

export function isCanonicalNonce(nonce: string): boolean {
  return NONCE_PATTERN.test(nonce) && BigInt(nonce) <= MAX_UINT64;
}

/** SHA-256(prefix || nonce as UTF-8) must start with `difficulty` zero bits. */
export function isPowSolution(
  challenge: PowChallenge,
  attempt: PowAttempt,
): boolean {
  if (attempt.purpose !== challenge.purpose) {
    return false;
  }
  if (attempt.now.getTime() >= challenge.expiresAt.getTime()) {
    return false;
  }
  if (!isCanonicalNonce(attempt.nonce)) {
    return false;
  }
  const digest = createHash('sha256')
    .update(challenge.prefix)
    .update(attempt.nonce, 'utf8')
    .digest();
  return countLeadingZeroBits(digest) >= challenge.difficulty;
}

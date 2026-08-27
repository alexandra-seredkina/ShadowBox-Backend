import { createHash } from 'node:crypto';
import {
  countLeadingZeroBits,
  createPowChallenge,
  isCanonicalNonce,
  isPowSolution,
  POW_TTL_MS,
  PowChallenge,
  PowChallengeId,
} from './pow-challenge.js';

const NOW = new Date('2026-08-27T17:05:00Z');
const PREFIX = new Uint8Array(16).fill(3);

function challengeWith(difficulty: number): PowChallenge {
  return {
    ...createPowChallenge({
      purpose: 'register',
      prefix: PREFIX,
      difficulty,
      now: NOW,
    }),
    id: '01928f3c-6b1e-7c4a-9f2d-3a8b5c6d7e8f' as PowChallengeId,
  };
}

function digestOf(nonce: string): Buffer {
  return createHash('sha256').update(PREFIX).update(nonce).digest();
}

function findNonce(difficulty: number, matches: boolean): string {
  for (let nonce = 0; ; nonce += 1) {
    const zeroBits = countLeadingZeroBits(digestOf(String(nonce)));
    if (zeroBits >= difficulty === matches) {
      return String(nonce);
    }
  }
}

describe('createPowChallenge', () => {
  it('expires five minutes after issue', () => {
    const challenge = challengeWith(20);

    expect(challenge.expiresAt.getTime() - NOW.getTime()).toBe(POW_TTL_MS);
  });

  it('rejects a prefix of the wrong size', () => {
    expect(() =>
      createPowChallenge({
        purpose: 'login',
        prefix: new Uint8Array(8),
        difficulty: 20,
        now: NOW,
      }),
    ).toThrow(RangeError);
  });

  it.each([0, 33, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => challengeWith(difficulty)).toThrow(RangeError);
  });
});

describe('countLeadingZeroBits', () => {
  it.each([
    [[0xff], 0],
    [[0x80], 0],
    [[0x01], 7],
    [[0x00, 0x40], 9],
    [[0x00, 0x00], 16],
  ])('counts %j as %i', (bytes, expected) => {
    expect(countLeadingZeroBits(Uint8Array.from(bytes))).toBe(expected);
  });
});

describe('isCanonicalNonce', () => {
  it.each(['0', '7', '18446744073709551615'])('accepts %s', (nonce) => {
    expect(isCanonicalNonce(nonce)).toBe(true);
  });

  it.each(['', '-1', '01', '1.5', '18446744073709551616', ' 1', '1e3'])(
    'rejects %j',
    (nonce) => {
      expect(isCanonicalNonce(nonce)).toBe(false);
    },
  );
});

describe('isPowSolution', () => {
  const difficulty = 8;
  const challenge = challengeWith(difficulty);

  it('accepts a nonce that meets the difficulty', () => {
    const nonce = findNonce(difficulty, true);

    expect(
      isPowSolution(challenge, { purpose: 'register', nonce, now: NOW }),
    ).toBe(true);
  });

  it('rejects a nonce that misses the difficulty', () => {
    const nonce = findNonce(difficulty, false);

    expect(
      isPowSolution(challenge, { purpose: 'register', nonce, now: NOW }),
    ).toBe(false);
  });

  it('rejects a solution for another purpose', () => {
    const nonce = findNonce(difficulty, true);

    expect(
      isPowSolution(challenge, { purpose: 'login', nonce, now: NOW }),
    ).toBe(false);
  });

  it('rejects a solution after expiry', () => {
    const nonce = findNonce(difficulty, true);

    expect(
      isPowSolution(challenge, {
        purpose: 'register',
        nonce,
        now: challenge.expiresAt,
      }),
    ).toBe(false);
  });

  it('rejects a non-canonical nonce even if its hash would match', () => {
    const nonce = findNonce(difficulty, true);

    expect(
      isPowSolution(challenge, {
        purpose: 'register',
        nonce: `0${nonce}`,
        now: NOW,
      }),
    ).toBe(false);
  });
});

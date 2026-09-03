import { createHash } from 'node:crypto';
import {
  draftSession,
  hashSessionToken,
  SESSION_ABSOLUTE_TTL_MS,
} from './session.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const ip = { hash: new Uint8Array(32).fill(1), keyVersion: 1 };

describe('draftSession', () => {
  it('keeps only the SHA-256 of the token', () => {
    const token = new Uint8Array(32).fill(9);

    const draft = draftSession({
      token,
      ip,
      isIpBound: true,
      device: 'Other · Other',
      now: NOW,
    });

    expect(Buffer.from(draft.tokenHash)).toEqual(
      createHash('sha256').update(token).digest(),
    );
    expect(draft).not.toHaveProperty('token');
  });

  it('expires after the absolute lifetime', () => {
    const draft = draftSession({
      token: new Uint8Array(32),
      ip,
      isIpBound: false,
      device: 'Other · Other',
      now: NOW,
    });

    expect(draft.expiresAt.getTime() - NOW.getTime()).toBe(
      SESSION_ABSOLUTE_TTL_MS,
    );
  });

  it('refuses a token shorter than 256 bits', () => {
    expect(() =>
      draftSession({
        token: new Uint8Array(16),
        ip,
        isIpBound: true,
        device: 'x',
        now: NOW,
      }),
    ).toThrow(RangeError);
  });
});

describe('hashSessionToken', () => {
  it('is deterministic', () => {
    const token = new Uint8Array(32).fill(3);

    expect(hashSessionToken(token)).toEqual(hashSessionToken(token));
  });
});

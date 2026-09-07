import { createHash } from 'node:crypto';
import type { AccountId } from './account.js';
import {
  draftSession,
  hashSessionToken,
  isSessionExpired,
  needsTouch,
  openReauthUntil,
  parseSessionToken,
  REAUTH_WINDOW_MS,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  SESSION_TOUCH_INTERVAL_MS,
  SessionId,
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

describe('session lifetime', () => {
  const session = {
    id: '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0d' as SessionId,
    accountId: '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0e' as AccountId,
    ip,
    isIpBound: true,
    reauthUntil: null,
    lastActiveAt: NOW,
    expiresAt: new Date(NOW.getTime() + SESSION_ABSOLUTE_TTL_MS),
  };
  const later = (ms: number): Date => new Date(NOW.getTime() + ms);

  it('stays alive within a day of inactivity', () => {
    expect(isSessionExpired(session, later(SESSION_IDLE_TTL_MS - 1))).toBe(
      false,
    );
  });

  it('expires after a day of inactivity', () => {
    expect(isSessionExpired(session, later(SESSION_IDLE_TTL_MS))).toBe(true);
  });

  it('expires at the absolute limit even when active', () => {
    const active = {
      ...session,
      lastActiveAt: later(SESSION_ABSOLUTE_TTL_MS - 1),
    };

    expect(isSessionExpired(active, later(SESSION_ABSOLUTE_TTL_MS))).toBe(true);
  });

  it('records activity only every few minutes', () => {
    expect(needsTouch(session, later(SESSION_TOUCH_INTERVAL_MS - 1))).toBe(
      false,
    );
    expect(needsTouch(session, later(SESSION_TOUCH_INTERVAL_MS))).toBe(true);
  });

  it('reports the reauth window only while it is open', () => {
    const until = later(REAUTH_WINDOW_MS);

    expect(openReauthUntil({ reauthUntil: until }, NOW)).toEqual(until);
    expect(openReauthUntil({ reauthUntil: until }, until)).toBeNull();
    expect(openReauthUntil({ reauthUntil: null }, NOW)).toBeNull();
  });
});

describe('parseSessionToken', () => {
  it('decodes a 32-byte base64url token', () => {
    const raw = Buffer.alloc(32, 7).toString('base64url');

    expect(parseSessionToken(raw)).toEqual(Buffer.alloc(32, 7));
  });

  it.each([
    null,
    '',
    'short',
    `${Buffer.alloc(32).toString('base64')}`,
    '%'.repeat(43),
  ])('refuses %j', (raw) => {
    expect(parseSessionToken(raw)).toBeNull();
  });
});

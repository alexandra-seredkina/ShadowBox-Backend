import { createHash } from 'node:crypto';
import type { Brand } from '../../../shared/kernel/brand.js';
import type { IpHash } from '../../../shared/kernel/ip-hasher.js';
import type { AccountId } from './account.js';

export type SessionId = Brand<string, 'SessionId'>;

export const SESSION_TOKEN_BYTES = 32;
export const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
/** lastActiveAt is written at most this often, not on every request. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
export const REAUTH_WINDOW_MS = 5 * 60 * 1000;

/** base64url of 32 bytes, without padding. */
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A session before it is attached to an account. */
export interface SessionDraft {
  readonly tokenHash: Uint8Array;
  readonly ip: IpHash;
  readonly isIpBound: boolean;
  readonly device: string;
  readonly expiresAt: Date;
}

export function hashSessionToken(token: Uint8Array): Uint8Array {
  return createHash('sha256').update(token).digest();
}

export function draftSession(params: {
  readonly token: Uint8Array;
  readonly ip: IpHash;
  readonly isIpBound: boolean;
  readonly device: string;
  readonly now: Date;
}): SessionDraft {
  if (params.token.length !== SESSION_TOKEN_BYTES) {
    throw new RangeError(`Session token must be ${SESSION_TOKEN_BYTES} bytes`);
  }
  return {
    tokenHash: hashSessionToken(params.token),
    ip: params.ip,
    isIpBound: params.isIpBound,
    device: params.device,
    expiresAt: new Date(params.now.getTime() + SESSION_ABSOLUTE_TTL_MS),
  };
}

export interface StoredSession {
  readonly id: SessionId;
  readonly accountId: AccountId;
  readonly ip: IpHash;
  readonly isIpBound: boolean;
  readonly reauthUntil: Date | null;
  readonly lastActiveAt: Date;
  readonly expiresAt: Date;
}

/** A session as its owner sees it in the list of devices. */
export interface SessionListing {
  readonly id: SessionId;
  readonly device: string;
  readonly isIpBound: boolean;
  readonly createdAt: Date;
  readonly lastActiveAt: Date;
}

/** The cookie value as bytes, or null for anything that cannot be a token. */
export function parseSessionToken(raw: string | null): Uint8Array | null {
  if (raw === null || !SESSION_TOKEN_PATTERN.test(raw)) {
    return null;
  }
  const token = Buffer.from(raw, 'base64url');
  return token.length === SESSION_TOKEN_BYTES ? token : null;
}

export function isSessionExpired(session: StoredSession, now: Date): boolean {
  return (
    now.getTime() >= session.expiresAt.getTime() ||
    now.getTime() - session.lastActiveAt.getTime() >= SESSION_IDLE_TTL_MS
  );
}

export function needsTouch(session: StoredSession, now: Date): boolean {
  return (
    now.getTime() - session.lastActiveAt.getTime() >= SESSION_TOUCH_INTERVAL_MS
  );
}

/** The end of the reauth window, or null when it is closed. */
export function openReauthUntil(
  session: Pick<StoredSession, 'reauthUntil'>,
  now: Date,
): Date | null {
  return session.reauthUntil !== null &&
    session.reauthUntil.getTime() > now.getTime()
    ? session.reauthUntil
    : null;
}

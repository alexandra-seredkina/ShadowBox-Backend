import { createHash } from 'node:crypto';
import type { Brand } from '../../../shared/kernel/brand.js';
import type { IpHash } from '../../../shared/kernel/ip-hasher.js';

export type SessionId = Brand<string, 'SessionId'>;

export const SESSION_TOKEN_BYTES = 32;
export const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

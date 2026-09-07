import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import { IpHasher } from '../../../shared/kernel/ip-hasher.js';
import type { AccountId } from '../domain/account.js';
import { UnauthenticatedError } from '../domain/identity.errors.js';
import {
  hashSessionToken,
  isSessionExpired,
  needsTouch,
  parseSessionToken,
  SessionId,
} from '../domain/session.js';
import { SessionRepository } from '../domain/session.repository.js';

export interface AuthenticateSessionCommand {
  /** Raw cookie value, null when the cookie is absent. */
  readonly token: string | null;
  readonly ip: string;
}

export interface AuthenticatedSession {
  readonly sessionId: SessionId;
  readonly accountId: AccountId;
  readonly reauthUntil: Date | null;
}

/**
 * Resolves the cookie to a live session. Expired sessions and sessions used
 * from another IP while bound to theirs are deleted, not just refused.
 */
@Injectable()
export class AuthenticateSessionHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly ipHasher: IpHasher,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: AuthenticateSessionCommand,
  ): Promise<AuthenticatedSession> {
    const token = parseSessionToken(command.token);
    const session =
      token === null
        ? null
        : await this.sessions.findByTokenHash(hashSessionToken(token));
    if (session === null) {
      throw new UnauthenticatedError();
    }
    const now = this.clock.now();
    const isIpMismatch =
      session.isIpBound && !this.ipHasher.matches(command.ip, session.ip);
    if (isSessionExpired(session, now) || isIpMismatch) {
      await this.sessions.delete(session.id);
      throw new UnauthenticatedError();
    }
    if (needsTouch(session, now)) {
      await this.sessions.touch(session.id, now);
    }
    return {
      sessionId: session.id,
      accountId: session.accountId,
      reauthUntil: session.reauthUntil,
    };
  }
}

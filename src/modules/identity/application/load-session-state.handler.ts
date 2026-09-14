import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import type { AccountKeys, AccountSummary } from '../domain/account.js';
import { AccountRepository } from '../domain/account.repository.js';
import { openReauthUntil, SessionId } from '../domain/session.js';
import type { AuthenticatedSession } from './authenticate-session.handler.js';

export interface SessionState {
  readonly account: AccountSummary;
  readonly keys: AccountKeys;
  readonly session: {
    readonly id: SessionId;
    readonly reauthUntil: Date | null;
  };
}

/** Everything the unlock screen needs after a page reload. */
@Injectable()
export class LoadSessionStateHandler {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute(session: AuthenticatedSession): Promise<SessionState> {
    const now = this.clock.now();
    const [account, keys] = await Promise.all([
      this.accounts.loadSummary(session.accountId, now),
      this.accounts.loadKeys(session.accountId),
    ]);
    return {
      account,
      keys,
      session: {
        id: session.sessionId,
        reauthUntil: openReauthUntil(session, now),
      },
    };
  }
}

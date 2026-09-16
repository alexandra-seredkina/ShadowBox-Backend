import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import type { SessionListing } from '../domain/session.js';
import { SessionRepository } from '../domain/session.repository.js';
import type { AuthenticatedSession } from './authenticate-session.handler.js';

export interface ListedSession extends SessionListing {
  readonly isCurrent: boolean;
}

@Injectable()
export class ListSessionsHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(current: AuthenticatedSession): Promise<ListedSession[]> {
    const live = await this.sessions.listLive(
      current.accountId,
      this.clock.now(),
    );
    return live.map((session) => ({
      ...session,
      isCurrent: session.id === current.sessionId,
    }));
  }
}

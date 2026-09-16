import { Injectable } from '@nestjs/common';
import { SessionRepository } from '../domain/session.repository.js';
import type { AuthenticatedSession } from './authenticate-session.handler.js';

@Injectable()
export class EndOtherSessionsHandler {
  constructor(private readonly sessions: SessionRepository) {}

  execute(current: AuthenticatedSession): Promise<void> {
    return this.sessions.deleteAllExcept(current.accountId, current.sessionId);
  }
}

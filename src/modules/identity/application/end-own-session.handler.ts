import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { Clock } from '../../../shared/kernel/clock.js';
import type { SessionId } from '../domain/session.js';
import { SessionRepository } from '../domain/session.repository.js';
import type { AuthenticatedSession } from './authenticate-session.handler.js';

export interface EndOwnSessionCommand {
  readonly current: AuthenticatedSession;
  readonly id: SessionId;
}

/** Ends one session of the account; ending the current one is signing out. */
@Injectable()
export class EndOwnSessionHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  /** @returns true when the caller ended their own current session. */
  async execute(command: EndOwnSessionCommand): Promise<boolean> {
    const isDeleted = await this.sessions.deleteOwn(
      command.current.accountId,
      command.id,
      this.clock.now(),
    );
    if (!isDeleted) {
      throw new NotFoundError();
    }
    return command.id === command.current.sessionId;
  }
}

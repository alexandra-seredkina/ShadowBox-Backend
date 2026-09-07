import { Injectable } from '@nestjs/common';
import { hashSessionToken, parseSessionToken } from '../domain/session.js';
import { SessionRepository } from '../domain/session.repository.js';

/** Signing out always succeeds: an unknown or missing token is simply ignored. */
@Injectable()
export class EndSessionHandler {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(rawToken: string | null): Promise<void> {
    const token = parseSessionToken(rawToken);
    if (token !== null) {
      await this.sessions.deleteByTokenHash(hashSessionToken(token));
    }
  }
}

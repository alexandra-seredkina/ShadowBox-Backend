import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import { SecureRandom } from '../../../shared/kernel/secure-random.js';
import { AccountRepository } from '../domain/account.repository.js';
import { AuthKeyHasher } from '../domain/auth-key-hasher.js';
import { InvalidCredentialsError } from '../domain/identity.errors.js';
import {
  hashSessionToken,
  REAUTH_WINDOW_MS,
  SESSION_TOKEN_BYTES,
} from '../domain/session.js';
import { SessionRepository } from '../domain/session.repository.js';
import type { AuthenticatedSession } from './authenticate-session.handler.js';

export interface ReauthenticateCommand {
  readonly session: AuthenticatedSession;
  readonly authKey: Uint8Array;
}

/** Opens the window for sensitive actions and rotates the token, as for any privilege change. */
@Injectable()
export class ReauthenticateHandler {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: AuthKeyHasher,
    private readonly random: SecureRandom,
    private readonly clock: Clock,
  ) {}

  /** @returns the new session token for the cookie. */
  async execute(command: ReauthenticateCommand): Promise<Uint8Array> {
    const credentials = await this.accounts.findCredentialsById(
      command.session.accountId,
    );
    if (
      credentials === null ||
      !(await this.hasher.verify(credentials.authKeyHash, command.authKey))
    ) {
      throw new InvalidCredentialsError();
    }
    const token = this.random.bytes(SESSION_TOKEN_BYTES);
    await this.sessions.grantReauth(command.session.sessionId, {
      tokenHash: hashSessionToken(token),
      reauthUntil: new Date(this.clock.now().getTime() + REAUTH_WINDOW_MS),
    });
    return token;
  }
}

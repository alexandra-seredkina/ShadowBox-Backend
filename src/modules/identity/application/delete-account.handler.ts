import { Injectable } from '@nestjs/common';
import { ReauthRequiredError } from '../../../shared/errors/reauth-required.error.js';
import { Clock } from '../../../shared/kernel/clock.js';
import { AccountRepository } from '../domain/account.repository.js';
import { openReauthUntil } from '../domain/session.js';
import type { AuthenticatedSession } from './authenticate-session.handler.js';

/**
 * Irreversible: with the encrypted keys gone, nothing left in a backup can be
 * decrypted any more. Requires the password again.
 */
@Injectable()
export class DeleteAccountHandler {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute(current: AuthenticatedSession): Promise<void> {
    const now = this.clock.now();
    if (openReauthUntil(current, now) === null) {
      throw new ReauthRequiredError();
    }
    await this.accounts.delete(current.accountId, now);
  }
}

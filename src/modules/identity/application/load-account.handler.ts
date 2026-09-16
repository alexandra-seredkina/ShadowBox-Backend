import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import type { AccountSummary } from '../domain/account.js';
import { AccountRepository } from '../domain/account.repository.js';
import type { AuthenticatedSession } from './authenticate-session.handler.js';

@Injectable()
export class LoadAccountHandler {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  execute(current: AuthenticatedSession): Promise<AccountSummary> {
    return this.accounts.loadSummary(current.accountId, this.clock.now());
  }
}

import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import { IpHasher } from '../../../shared/kernel/ip-hasher.js';
import type { AccountSummary } from '../domain/account.js';
import { AccountRepository } from '../domain/account.repository.js';
import type { AuthenticatedSession } from './authenticate-session.handler.js';

export interface ChangeIpBindingCommand {
  readonly current: AuthenticatedSession;
  readonly isEnabled: boolean;
  /** The caller's address: enabling binds the current session to it. */
  readonly ip: string;
}

@Injectable()
export class ChangeIpBindingHandler {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly ipHasher: IpHasher,
    private readonly clock: Clock,
  ) {}

  async execute(command: ChangeIpBindingCommand): Promise<AccountSummary> {
    await this.accounts.changeIpBinding({
      accountId: command.current.accountId,
      isEnabled: command.isEnabled,
      currentSession: command.current.sessionId,
      currentIp: this.ipHasher.hash(command.ip),
    });
    return this.accounts.loadSummary(
      command.current.accountId,
      this.clock.now(),
    );
  }
}

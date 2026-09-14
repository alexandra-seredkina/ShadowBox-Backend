import { Injectable } from '@nestjs/common';
import type { ScheduledJob } from '../../../shared/kernel/scheduled-job.js';
import { AliasRepository } from '../domain/alias.repository.js';

/**
 * Turns expired temporary addresses into revoked ones. Until it runs they are
 * already invisible and refuse mail; the run makes it permanent and wipes labels.
 */
@Injectable()
export class ExpireTemporaryAliasesJob implements ScheduledJob {
  readonly name = 'aliases.expire-temporary';
  readonly intervalMs = 60 * 1000;

  constructor(private readonly aliases: AliasRepository) {}

  run(now: Date): Promise<number> {
    return this.aliases.revokeExpired(now);
  }
}

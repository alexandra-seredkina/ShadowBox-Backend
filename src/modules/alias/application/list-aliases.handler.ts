import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import type { Alias, AliasStatus, OwnerId } from '../domain/alias.js';
import { AliasRepository } from '../domain/alias.repository.js';

export interface ListAliasesQuery {
  readonly ownerId: OwnerId;
  readonly status: AliasStatus | null;
}

@Injectable()
export class ListAliasesHandler {
  constructor(
    private readonly aliases: AliasRepository,
    private readonly clock: Clock,
  ) {}

  execute(query: ListAliasesQuery): Promise<Alias[]> {
    return this.aliases.list(query.ownerId, {
      status: query.status,
      now: this.clock.now(),
    });
  }
}

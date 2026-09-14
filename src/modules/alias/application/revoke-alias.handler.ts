import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { ReauthRequiredError } from '../../../shared/errors/reauth-required.error.js';
import { Clock } from '../../../shared/kernel/clock.js';
import type { AliasId, OwnerId } from '../domain/alias.js';
import { AliasRepository } from '../domain/alias.repository.js';

export interface RevokeAliasCommand {
  readonly ownerId: OwnerId;
  readonly id: AliasId;
  /** End of the caller's reauth window, null when it was never opened. */
  readonly reauthUntil: Date | null;
}

/**
 * A permanent address is usually registered on many sites, so giving it up
 * needs the password again; a temporary one does not.
 */
@Injectable()
export class RevokeAliasHandler {
  constructor(
    private readonly aliases: AliasRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: RevokeAliasCommand): Promise<void> {
    const now = this.clock.now();
    const alias = await this.aliases.findOwn(command.ownerId, command.id, now);
    if (alias === null) {
      throw new NotFoundError();
    }
    const isReauthOpen =
      command.reauthUntil !== null &&
      command.reauthUntil.getTime() > now.getTime();
    if (alias.kind === 'permanent' && !isReauthOpen) {
      throw new ReauthRequiredError();
    }
    await this.aliases.revoke(command.ownerId, command.id, now);
  }
}

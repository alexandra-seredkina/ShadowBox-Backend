import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { Clock } from '../../../shared/kernel/clock.js';
import {
  Alias,
  AliasChanges,
  AliasId,
  MAX_ACTIVE_ALIASES,
  OwnerId,
} from '../domain/alias.js';
import { AliasRepository } from '../domain/alias.repository.js';
import { FolderDirectory } from '../domain/folder-directory.js';

export interface UpdateAliasCommand {
  readonly ownerId: OwnerId;
  readonly id: AliasId;
  readonly changes: AliasChanges;
}

@Injectable()
export class UpdateAliasHandler {
  constructor(
    private readonly aliases: AliasRepository,
    private readonly folders: FolderDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: UpdateAliasCommand): Promise<Alias> {
    const { folderId } = command.changes;
    if (
      folderId !== undefined &&
      folderId !== null &&
      !(await this.folders.isOwnFolder(command.ownerId, folderId))
    ) {
      throw new NotFoundError();
    }
    const updated = await this.aliases.update(
      command.ownerId,
      command.id,
      command.changes,
      { maxActive: MAX_ACTIVE_ALIASES, now: this.clock.now() },
    );
    if (updated === null) {
      throw new NotFoundError();
    }
    return updated;
  }
}

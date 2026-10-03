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
import { LabelDirectory } from '../domain/label-directory.js';

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
    private readonly labels: LabelDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: UpdateAliasCommand): Promise<Alias> {
    const { folderId, labelIds } = command.changes;
    if (
      (folderId !== undefined &&
        folderId !== null &&
        !(await this.folders.isOwnFolder(command.ownerId, folderId))) ||
      (labelIds !== undefined &&
        !(await this.labels.areOwnLabels(command.ownerId, labelIds)))
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

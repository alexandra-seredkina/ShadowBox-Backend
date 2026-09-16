import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type { FolderId, FolderOwnerId } from '../domain/folder.js';
import { FolderRepository } from '../domain/folder.repository.js';

@Injectable()
export class DeleteFolderHandler {
  constructor(private readonly folders: FolderRepository) {}

  async execute(command: {
    readonly ownerId: FolderOwnerId;
    readonly id: FolderId;
  }): Promise<void> {
    if (!(await this.folders.delete(command.ownerId, command.id))) {
      throw new NotFoundError();
    }
  }
}

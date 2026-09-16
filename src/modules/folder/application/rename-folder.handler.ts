import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { Folder, FolderId, FolderOwnerId } from '../domain/folder.js';
import { FolderRepository } from '../domain/folder.repository.js';

@Injectable()
export class RenameFolderHandler {
  constructor(private readonly folders: FolderRepository) {}

  async execute(command: {
    readonly ownerId: FolderOwnerId;
    readonly id: FolderId;
    readonly encryptedName: EncryptedBlobJson;
  }): Promise<Folder> {
    const renamed = await this.folders.rename(
      command.ownerId,
      command.id,
      command.encryptedName,
    );
    if (renamed === null) {
      throw new NotFoundError();
    }
    return renamed;
  }
}

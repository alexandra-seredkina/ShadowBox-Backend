import { Injectable } from '@nestjs/common';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import { Folder, FolderOwnerId, MAX_CUSTOM_FOLDERS } from '../domain/folder.js';
import { FolderRepository } from '../domain/folder.repository.js';

@Injectable()
export class CreateFolderHandler {
  constructor(private readonly folders: FolderRepository) {}

  execute(command: {
    readonly ownerId: FolderOwnerId;
    readonly encryptedName: EncryptedBlobJson;
  }): Promise<Folder> {
    return this.folders.create(
      command.ownerId,
      command.encryptedName,
      MAX_CUSTOM_FOLDERS,
    );
  }
}

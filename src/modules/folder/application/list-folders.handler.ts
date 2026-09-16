import { Injectable } from '@nestjs/common';
import type { Folder, FolderOwnerId } from '../domain/folder.js';
import { FolderRepository } from '../domain/folder.repository.js';

@Injectable()
export class ListFoldersHandler {
  constructor(private readonly folders: FolderRepository) {}

  execute(ownerId: FolderOwnerId): Promise<Folder[]> {
    return this.folders.list(ownerId);
  }
}

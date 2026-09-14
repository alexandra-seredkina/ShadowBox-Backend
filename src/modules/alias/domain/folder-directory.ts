import type { OwnerId } from './alias.js';

/** Answers whether a folder belongs to the owner, without exposing anything else. */
export abstract class FolderDirectory {
  abstract isOwnFolder(ownerId: OwnerId, folderId: string): Promise<boolean>;
}

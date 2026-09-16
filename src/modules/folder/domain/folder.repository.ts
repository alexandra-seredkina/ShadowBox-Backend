import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { Folder, FolderId, FolderOwnerId } from './folder.js';

/**
 * Every call is scoped to the owner. Someone else's folder is reported as
 * missing (null / false) before any rule about system folders is applied.
 */
export abstract class FolderRepository {
  /** System folders first in SYSTEM_ROLES order, then custom ones by creation. */
  abstract list(ownerId: FolderOwnerId): Promise<Folder[]>;

  /** @throws FolderLimitExceededError */
  abstract create(
    ownerId: FolderOwnerId,
    encryptedName: EncryptedBlobJson,
    maxCustom: number,
  ): Promise<Folder>;

  /** @throws FolderIsSystemError */
  abstract rename(
    ownerId: FolderOwnerId,
    id: FolderId,
    encryptedName: EncryptedBlobJson,
  ): Promise<Folder | null>;

  /**
   * Moves the folder's messages to the inbox, unpins addresses from it and
   * deletes it, in one transaction.
   * @returns false when the folder is not the owner's.
   * @throws FolderIsSystemError
   */
  abstract delete(ownerId: FolderOwnerId, id: FolderId): Promise<boolean>;
}

import type { Brand } from '../../../shared/kernel/brand.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';

export type FolderId = Brand<string, 'FolderId'>;
/** Accounts are owned by identity; here only their id is needed. */
export type FolderOwnerId = Brand<string, 'FolderOwnerId'>;

export const MAX_CUSTOM_FOLDERS = 50;

/** Display order of the folders every account gets at sign-up. */
export const SYSTEM_ROLES = ['inbox', 'spam', 'trash'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** System folders have a role and no name; custom ones the other way round. */
export type Folder =
  | {
      readonly id: FolderId;
      readonly kind: 'system';
      readonly systemRole: SystemRole;
      readonly unreadCount: number;
    }
  | {
      readonly id: FolderId;
      readonly kind: 'custom';
      readonly encryptedName: EncryptedBlobJson;
      readonly unreadCount: number;
    };

import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { Folder } from '../domain/folder.js';

export interface FolderResponse {
  readonly id: string;
  readonly kind: 'system' | 'custom';
  readonly systemRole: string | null;
  readonly encryptedName: EncryptedBlobJson | null;
  readonly unreadCount: number;
}

export function toFolderResponse(folder: Folder): FolderResponse {
  return folder.kind === 'system'
    ? {
        id: folder.id,
        kind: 'system',
        systemRole: folder.systemRole,
        encryptedName: null,
        unreadCount: folder.unreadCount,
      }
    : {
        id: folder.id,
        kind: 'custom',
        systemRole: null,
        encryptedName: folder.encryptedName,
        unreadCount: folder.unreadCount,
      };
}

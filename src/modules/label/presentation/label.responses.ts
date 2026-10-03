import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { Label } from '../domain/label.js';

export interface LabelResponse {
  readonly id: string;
  readonly encryptedName: EncryptedBlobJson;
  readonly unreadCount: number;
}

export function toLabelResponse(label: Label): LabelResponse {
  return {
    id: label.id,
    encryptedName: label.encryptedName,
    unreadCount: label.unreadCount,
  };
}

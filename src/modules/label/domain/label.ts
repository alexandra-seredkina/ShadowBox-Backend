import type { Brand } from '../../../shared/kernel/brand.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';

export type LabelId = Brand<string, 'LabelId'>;
/** Accounts are owned by identity; here only their id is needed. */
export type LabelOwnerId = Brand<string, 'LabelOwnerId'>;

export const MAX_LABELS = 50;

/** Name and color are sealed together; the server sees neither. */
export interface Label {
  readonly id: LabelId;
  readonly encryptedName: EncryptedBlobJson;
  /** Unread labelled messages outside the trash. */
  readonly unreadCount: number;
}

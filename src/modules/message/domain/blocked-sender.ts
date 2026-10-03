import type { Brand } from '../../../shared/kernel/brand.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';

export type BlockedSenderId = Brand<string, 'BlockedSenderId'>;

export const MAX_BLOCKED_SENDERS = 1000;

/** Only the owner can read the address; the server matches mail by a keyed hash. */
export interface BlockedSender {
  readonly id: BlockedSenderId;
  readonly encryptedAddress: EncryptedBlobJson;
  readonly createdAt: Date;
}

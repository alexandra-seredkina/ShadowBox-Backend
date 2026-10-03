import { toApiDate } from '../../../shared/http/api-format.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { BlockedSender } from '../domain/blocked-sender.js';

export interface BlockedSenderResponse {
  readonly id: string;
  readonly encryptedAddress: EncryptedBlobJson;
  readonly createdAt: string;
}

export function toBlockedSenderResponse(
  blocked: BlockedSender,
): BlockedSenderResponse {
  return {
    id: blocked.id,
    encryptedAddress: blocked.encryptedAddress,
    createdAt: toApiDate(blocked.createdAt),
  };
}

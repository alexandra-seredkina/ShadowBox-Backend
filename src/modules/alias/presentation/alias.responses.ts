import { toApiDate, toApiInstant } from '../../../shared/http/api-format.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { Alias } from '../domain/alias.js';

export interface AliasResponse {
  readonly id: string;
  readonly address: string;
  readonly kind: string;
  readonly status: string;
  readonly encryptedLabel: EncryptedBlobJson | null;
  readonly folderId: string | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly lastReceivedAt: string | null;
}

export function toAliasResponse(alias: Alias): AliasResponse {
  return {
    id: alias.id,
    address: `${alias.localPart}@${alias.domain}`,
    kind: alias.kind,
    status: alias.status,
    encryptedLabel: alias.encryptedLabel,
    folderId: alias.folderId,
    expiresAt: alias.expiresAt === null ? null : toApiInstant(alias.expiresAt),
    createdAt: toApiDate(alias.createdAt),
    lastReceivedAt:
      alias.lastReceivedAt === null ? null : toApiDate(alias.lastReceivedAt),
  };
}

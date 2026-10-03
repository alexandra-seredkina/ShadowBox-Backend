import {
  toApiInstant,
  toEncryptedBlobJson,
} from '../../../shared/http/api-format.js';
import type {
  EncryptedBlob,
  EncryptedBlobJson,
} from '../../../shared/kernel/encrypted-blob.js';
import type { MessageSummary } from '../domain/message.js';

export interface MessageSummaryResponse {
  readonly id: string;
  readonly folderId: string;
  readonly aliasId: string | null;
  readonly receivedAt: string;
  readonly isRead: boolean;
  readonly isStarred: boolean;
  readonly sizeBytes: number;
  readonly labelIds: readonly string[];
  readonly threat: {
    readonly verdict: string;
    readonly markers: readonly string[];
    readonly auth: {
      readonly spf: string;
      readonly dkim: string;
      readonly dmarc: string;
    };
  };
  readonly encryptedPreview: EncryptedBlobJson;
}

export function toMessageSummaryResponse(
  message: MessageSummary,
): MessageSummaryResponse {
  return {
    id: message.id,
    folderId: message.folderId,
    aliasId: message.aliasId,
    receivedAt: toApiInstant(message.receivedAt),
    isRead: message.isRead,
    isStarred: message.isStarred,
    sizeBytes: message.sizeBytes,
    labelIds: message.labelIds,
    threat: {
      verdict: message.threat.verdict,
      markers: message.threat.markers,
      auth: { ...message.threat.auth },
    },
    encryptedPreview: message.encryptedPreview,
  };
}

export function toMessageContentResponse(body: EncryptedBlob): {
  body: EncryptedBlobJson;
} {
  return { body: toEncryptedBlobJson(body) };
}

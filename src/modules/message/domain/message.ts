import type { Brand } from '../../../shared/kernel/brand.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { Threat } from './threat.js';

export type MessageId = Brand<string, 'MessageId'>;
/** Accounts are owned by identity; here only their id is needed. */
export type MessageOwnerId = Brand<string, 'MessageOwnerId'>;
export type MessageAliasId = Brand<string, 'MessageAliasId'>;
export type MessageFolderId = Brand<string, 'MessageFolderId'>;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const MAX_BATCH_IDS = 100;

const KIB = 1024;

/** Sizes are shown rounded up to 1 KiB, so the exact length of a message never leaves the server. */
export function roundUpToKiB(bytes: number): number {
  return Math.ceil(bytes / KIB) * KIB;
}

/** Everything about a message except its body; the preview inside is sealed. */
export interface MessageSummary {
  readonly id: MessageId;
  readonly folderId: MessageFolderId;
  /** Null once the address it came to is deleted. */
  readonly aliasId: MessageAliasId | null;
  readonly receivedAt: Date;
  readonly isRead: boolean;
  readonly sizeBytes: number;
  readonly threat: Threat;
  readonly encryptedPreview: EncryptedBlobJson;
}

/** Where a page ends in "newest first" order; the next page starts after it. */
export interface MessagePosition {
  readonly receivedAt: Date;
  readonly id: MessageId;
}

/** A position is only meaningful inside the folder it was taken from. */
export interface MessageCursor extends MessagePosition {
  readonly folderId: MessageFolderId;
}

export interface MessageChanges {
  readonly isRead?: boolean;
  readonly folderId?: MessageFolderId;
}

export type BatchAction =
  | { readonly kind: 'markRead' }
  | { readonly kind: 'markUnread' }
  | { readonly kind: 'move'; readonly folderId: MessageFolderId }
  | { readonly kind: 'delete' };

import type { EncryptedBlob } from '../../../shared/kernel/encrypted-blob.js';
import type {
  BatchAction,
  MessageChanges,
  MessageFolderId,
  MessageId,
  MessageOwnerId,
  MessagePosition,
  MessageScope,
  MessageSummary,
} from './message.js';

/**
 * Every call is scoped to the owner: someone else's message or folder is
 * reported as missing (null / false), exactly like one that does not exist.
 */
export abstract class MessageRepository {
  abstract isOwnFolder(
    ownerId: MessageOwnerId,
    folderId: MessageFolderId,
  ): Promise<boolean>;

  /** Newest first (receivedAt, then id), starting after `after`. */
  abstract list(
    ownerId: MessageOwnerId,
    scope: MessageScope,
    after: MessagePosition | null,
    limit: number,
  ): Promise<MessageSummary[]>;

  abstract find(
    ownerId: MessageOwnerId,
    id: MessageId,
  ): Promise<MessageSummary | null>;

  abstract loadBody(
    ownerId: MessageOwnerId,
    id: MessageId,
  ): Promise<EncryptedBlob | null>;

  /** Null when the message, or the folder to move it to, is not the owner's. */
  abstract update(
    ownerId: MessageOwnerId,
    id: MessageId,
    changes: MessageChanges,
  ): Promise<MessageSummary | null>;

  /**
   * One transaction over the owner's messages among `ids`, others skipped.
   * @returns how many were found, or null when the target folder of a move
   *   is not the owner's (and nothing changed).
   */
  abstract applyBatch(
    ownerId: MessageOwnerId,
    ids: readonly MessageId[],
    action: BatchAction,
  ): Promise<number | null>;

  /** Hard delete; false when it is not the owner's. */
  abstract delete(ownerId: MessageOwnerId, id: MessageId): Promise<boolean>;
}

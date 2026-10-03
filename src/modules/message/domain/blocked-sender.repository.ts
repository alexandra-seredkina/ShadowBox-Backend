import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { BlockedSender, BlockedSenderId } from './blocked-sender.js';
import type { MessageOwnerId } from './message.js';
import type { SenderHash } from './sender-hasher.js';

export interface BlockResult {
  readonly blocked: BlockedSender;
  /** False when the sender was already blocked; the earlier entry is kept. */
  readonly isNew: boolean;
}

/** Every call is scoped to the owner; someone else's entry is reported as missing. */
export abstract class BlockedSenderRepository {
  /** Newest first. */
  abstract list(ownerId: MessageOwnerId): Promise<BlockedSender[]>;

  /** @throws BlockLimitExceededError */
  abstract block(
    ownerId: MessageOwnerId,
    sender: SenderHash,
    encryptedAddress: EncryptedBlobJson,
    maxBlocked: number,
  ): Promise<BlockResult>;

  abstract unblock(
    ownerId: MessageOwnerId,
    id: BlockedSenderId,
  ): Promise<boolean>;
}

import { Injectable } from '@nestjs/common';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import { MAX_BLOCKED_SENDERS } from '../domain/blocked-sender.js';
import {
  BlockedSenderRepository,
  BlockResult,
} from '../domain/blocked-sender.repository.js';
import type { MessageOwnerId } from '../domain/message.js';
import { SenderHasher } from '../domain/sender-hasher.js';

/** The address is hashed here and goes no further: not stored, not logged. */
@Injectable()
export class BlockSenderHandler {
  constructor(
    private readonly blocked: BlockedSenderRepository,
    private readonly senderHasher: SenderHasher,
  ) {}

  execute(command: {
    readonly ownerId: MessageOwnerId;
    readonly address: string;
    readonly encryptedAddress: EncryptedBlobJson;
  }): Promise<BlockResult> {
    return this.blocked.block(
      command.ownerId,
      this.senderHasher.hash(command.ownerId, command.address),
      command.encryptedAddress,
      MAX_BLOCKED_SENDERS,
    );
  }
}

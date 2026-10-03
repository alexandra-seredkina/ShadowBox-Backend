import { Injectable } from '@nestjs/common';
import type { BlockedSender } from '../domain/blocked-sender.js';
import { BlockedSenderRepository } from '../domain/blocked-sender.repository.js';
import type { MessageOwnerId } from '../domain/message.js';

@Injectable()
export class ListBlockedSendersHandler {
  constructor(private readonly blocked: BlockedSenderRepository) {}

  execute(ownerId: MessageOwnerId): Promise<BlockedSender[]> {
    return this.blocked.list(ownerId);
  }
}

import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type { BlockedSenderId } from '../domain/blocked-sender.js';
import { BlockedSenderRepository } from '../domain/blocked-sender.repository.js';
import type { MessageOwnerId } from '../domain/message.js';

@Injectable()
export class UnblockSenderHandler {
  constructor(private readonly blocked: BlockedSenderRepository) {}

  async execute(command: {
    readonly ownerId: MessageOwnerId;
    readonly id: BlockedSenderId;
  }): Promise<void> {
    if (!(await this.blocked.unblock(command.ownerId, command.id))) {
      throw new NotFoundError();
    }
  }
}

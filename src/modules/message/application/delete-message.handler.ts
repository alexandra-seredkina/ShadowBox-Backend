import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type { MessageId, MessageOwnerId } from '../domain/message.js';
import { MessageRepository } from '../domain/message.repository.js';

/** Removes the ciphertext for good; moving to the trash is an update instead. */
@Injectable()
export class DeleteMessageHandler {
  constructor(private readonly messages: MessageRepository) {}

  async execute(command: {
    readonly ownerId: MessageOwnerId;
    readonly id: MessageId;
  }): Promise<void> {
    if (!(await this.messages.delete(command.ownerId, command.id))) {
      throw new NotFoundError();
    }
  }
}

import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type {
  MessageChanges,
  MessageId,
  MessageOwnerId,
  MessageSummary,
} from '../domain/message.js';
import { MessageRepository } from '../domain/message.repository.js';

@Injectable()
export class UpdateMessageHandler {
  constructor(private readonly messages: MessageRepository) {}

  async execute(command: {
    readonly ownerId: MessageOwnerId;
    readonly id: MessageId;
    readonly changes: MessageChanges;
  }): Promise<MessageSummary> {
    const updated = await this.messages.update(
      command.ownerId,
      command.id,
      command.changes,
    );
    if (updated === null) {
      throw new NotFoundError();
    }
    return updated;
  }
}

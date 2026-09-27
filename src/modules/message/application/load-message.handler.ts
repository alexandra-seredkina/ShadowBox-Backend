import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type {
  MessageId,
  MessageOwnerId,
  MessageSummary,
} from '../domain/message.js';
import { MessageRepository } from '../domain/message.repository.js';

@Injectable()
export class LoadMessageHandler {
  constructor(private readonly messages: MessageRepository) {}

  async execute(query: {
    readonly ownerId: MessageOwnerId;
    readonly id: MessageId;
  }): Promise<MessageSummary> {
    const message = await this.messages.find(query.ownerId, query.id);
    if (message === null) {
      throw new NotFoundError();
    }
    return message;
  }
}

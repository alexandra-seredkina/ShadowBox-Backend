import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type { EncryptedBlob } from '../../../shared/kernel/encrypted-blob.js';
import type { MessageId, MessageOwnerId } from '../domain/message.js';
import { MessageRepository } from '../domain/message.repository.js';

/** The sealed raw message; reading it does not mark the message read. */
@Injectable()
export class LoadMessageContentHandler {
  constructor(private readonly messages: MessageRepository) {}

  async execute(query: {
    readonly ownerId: MessageOwnerId;
    readonly id: MessageId;
  }): Promise<EncryptedBlob> {
    const body = await this.messages.loadBody(query.ownerId, query.id);
    if (body === null) {
      throw new NotFoundError();
    }
    return body;
  }
}

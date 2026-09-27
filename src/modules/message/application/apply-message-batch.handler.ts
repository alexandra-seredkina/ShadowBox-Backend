import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type {
  BatchAction,
  MessageId,
  MessageOwnerId,
} from '../domain/message.js';
import { MessageRepository } from '../domain/message.repository.js';

@Injectable()
export class ApplyMessageBatchHandler {
  constructor(private readonly messages: MessageRepository) {}

  /** @returns how many of the owner's messages were among `ids`. */
  async execute(command: {
    readonly ownerId: MessageOwnerId;
    readonly ids: readonly MessageId[];
    readonly action: BatchAction;
  }): Promise<number> {
    const processed = await this.messages.applyBatch(
      command.ownerId,
      [...new Set(command.ids)],
      command.action,
    );
    if (processed === null) {
      throw new NotFoundError();
    }
    return processed;
  }
}

import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import type {
  MessageCursor,
  MessageFolderId,
  MessageOwnerId,
  MessageSummary,
} from '../domain/message.js';
import { MessageRepository } from '../domain/message.repository.js';

export interface MessagePage {
  readonly items: readonly MessageSummary[];
  /** Null on the last page. */
  readonly next: MessageCursor | null;
}

@Injectable()
export class ListMessagesHandler {
  constructor(private readonly messages: MessageRepository) {}

  async execute(query: {
    readonly ownerId: MessageOwnerId;
    readonly folderId: MessageFolderId;
    readonly cursor: MessageCursor | null;
    readonly limit: number;
  }): Promise<MessagePage> {
    if (!(await this.messages.isOwnFolder(query.ownerId, query.folderId))) {
      throw new NotFoundError();
    }
    if (query.cursor !== null && query.cursor.folderId !== query.folderId) {
      throw new ValidationFailedError([
        { path: 'cursor', issue: 'invalid_value' },
      ]);
    }
    // One extra row tells whether another page follows.
    const rows = await this.messages.list(
      query.ownerId,
      query.folderId,
      query.cursor,
      query.limit + 1,
    );
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items,
      next:
        rows.length > query.limit && last !== undefined
          ? {
              folderId: query.folderId,
              receivedAt: last.receivedAt,
              id: last.id,
            }
          : null,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import type {
  MessageCursor,
  MessageOwnerId,
  MessageScope,
  MessageSummary,
} from '../domain/message.js';
import { isSameScope } from '../domain/message.js';
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
    readonly scope: MessageScope;
    readonly cursor: MessageCursor | null;
    readonly limit: number;
  }): Promise<MessagePage> {
    if (!(await this.isOwnScope(query.ownerId, query.scope))) {
      throw new NotFoundError();
    }
    if (
      query.cursor !== null &&
      !isSameScope(query.cursor.scope, query.scope)
    ) {
      throw new ValidationFailedError([
        { path: 'cursor', issue: 'invalid_value' },
      ]);
    }
    // One extra row tells whether another page follows.
    const rows = await this.messages.list(
      query.ownerId,
      query.scope,
      query.cursor,
      query.limit + 1,
    );
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items,
      next:
        rows.length > query.limit && last !== undefined
          ? { scope: query.scope, receivedAt: last.receivedAt, id: last.id }
          : null,
    };
  }

  private async isOwnScope(
    ownerId: MessageOwnerId,
    scope: MessageScope,
  ): Promise<boolean> {
    switch (scope.kind) {
      case 'folder':
        return this.messages.isOwnFolder(ownerId, scope.folderId);
      case 'starred':
        return true;
    }
  }
}

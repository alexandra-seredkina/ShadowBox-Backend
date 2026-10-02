import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import type { AuthenticatedSession } from '../../identity/identity.api.js';
import { CurrentSession, SessionGuard } from '../../identity/identity.api.js';
import { ApplyMessageBatchHandler } from '../application/apply-message-batch.handler.js';
import { DeleteMessageHandler } from '../application/delete-message.handler.js';
import { ListMessagesHandler } from '../application/list-messages.handler.js';
import { LoadMessageContentHandler } from '../application/load-message-content.handler.js';
import { LoadMessageHandler } from '../application/load-message.handler.js';
import { UpdateMessageHandler } from '../application/update-message.handler.js';
import type { MessageFolderId, MessageOwnerId } from '../domain/message.js';
import { decodeCursor, encodeCursor } from './message-cursor.js';
import {
  MessageSummaryResponse,
  toMessageContentResponse,
  toMessageSummaryResponse,
} from './message.responses.js';
import type {
  BatchRequest,
  ListMessagesQuery,
  UpdateMessageRequest,
} from './message.schemas.js';
import {
  batchRequestSchema,
  listMessagesQuerySchema,
  parseMessageId,
  toBatchAction,
  toMessageScope,
  updateMessageRequestSchema,
} from './message.schemas.js';

function ownerOf(session: AuthenticatedSession): MessageOwnerId {
  return session.accountId as string as MessageOwnerId;
}

@Controller('messages')
@UseGuards(SessionGuard)
export class MessageController {
  constructor(
    private readonly listMessages: ListMessagesHandler,
    private readonly loadMessage: LoadMessageHandler,
    private readonly loadContent: LoadMessageContentHandler,
    private readonly updateMessage: UpdateMessageHandler,
    private readonly applyBatch: ApplyMessageBatchHandler,
    private readonly deleteMessage: DeleteMessageHandler,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listMessagesQuerySchema))
    query: ListMessagesQuery,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ items: MessageSummaryResponse[]; nextCursor: string | null }> {
    const page = await this.listMessages.execute({
      ownerId: ownerOf(session),
      scope: toMessageScope(query),
      cursor: query.cursor === undefined ? null : decodeCursor(query.cursor),
      limit: query.limit,
    });
    return {
      items: page.items.map(toMessageSummaryResponse),
      nextCursor: page.next === null ? null : encodeCursor(page.next),
    };
  }

  /** Before `:id`, so "batch" is never taken for a message id. */
  @Post('batch')
  @HttpCode(HttpStatus.OK)
  async batch(
    @Body(new ZodValidationPipe(batchRequestSchema)) body: BatchRequest,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ processed: number }> {
    const processed = await this.applyBatch.execute({
      ownerId: ownerOf(session),
      ids: body.ids.map(parseMessageId),
      action: toBatchAction(body),
    });
    return { processed };
  }

  @Get(':id')
  async load(
    @Param('id') id: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<MessageSummaryResponse> {
    const message = await this.loadMessage.execute({
      ownerId: ownerOf(session),
      id: parseMessageId(id),
    });
    return toMessageSummaryResponse(message);
  }

  @Get(':id/content')
  async content(
    @Param('id') id: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ body: EncryptedBlobJson }> {
    const body = await this.loadContent.execute({
      ownerId: ownerOf(session),
      id: parseMessageId(id),
    });
    return toMessageContentResponse(body);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMessageRequestSchema))
    body: UpdateMessageRequest,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<MessageSummaryResponse> {
    const message = await this.updateMessage.execute({
      ownerId: ownerOf(session),
      id: parseMessageId(id),
      changes: {
        ...(body.isRead === undefined ? {} : { isRead: body.isRead }),
        ...(body.isStarred === undefined ? {} : { isStarred: body.isStarred }),
        ...(body.folderId === undefined
          ? {}
          : { folderId: body.folderId as MessageFolderId }),
      },
    });
    return toMessageSummaryResponse(message);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await this.deleteMessage.execute({
      ownerId: ownerOf(session),
      id: parseMessageId(id),
    });
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import type { AuthenticatedSession } from '../../identity/identity.api.js';
import { CurrentSession, SessionGuard } from '../../identity/identity.api.js';
import { BlockSenderHandler } from '../application/block-sender.handler.js';
import { ListBlockedSendersHandler } from '../application/list-blocked-senders.handler.js';
import { UnblockSenderHandler } from '../application/unblock-sender.handler.js';
import type { MessageOwnerId } from '../domain/message.js';
import {
  BlockedSenderResponse,
  toBlockedSenderResponse,
} from './blocked-sender.responses.js';
import type { BlockSenderRequest } from './blocked-sender.schemas.js';
import {
  blockSenderRequestSchema,
  parseBlockedSenderId,
} from './blocked-sender.schemas.js';

function ownerOf(session: AuthenticatedSession): MessageOwnerId {
  return session.accountId as string as MessageOwnerId;
}

@Controller('blocked-senders')
@UseGuards(SessionGuard)
export class BlockedSenderController {
  constructor(
    private readonly listBlocked: ListBlockedSendersHandler,
    private readonly blockSender: BlockSenderHandler,
    private readonly unblockSender: UnblockSenderHandler,
  ) {}

  @Get()
  async list(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ items: BlockedSenderResponse[] }> {
    const blocked = await this.listBlocked.execute(ownerOf(session));
    return { items: blocked.map(toBlockedSenderResponse) };
  }

  /** 201 for a new entry, 200 when the sender was already blocked. */
  @Post()
  async block(
    @Body(new ZodValidationPipe(blockSenderRequestSchema))
    body: BlockSenderRequest,
    @CurrentSession() session: AuthenticatedSession,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BlockedSenderResponse> {
    const result = await this.blockSender.execute({
      ownerId: ownerOf(session),
      address: body.address,
      encryptedAddress: body.encryptedAddress,
    });
    response.status(result.isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return toBlockedSenderResponse(result.blocked);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(
    @Param('id') id: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await this.unblockSender.execute({
      ownerId: ownerOf(session),
      id: parseBlockedSenderId(id),
    });
  }
}

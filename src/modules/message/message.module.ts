import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { ApplyMessageBatchHandler } from './application/apply-message-batch.handler.js';
import { BlockSenderHandler } from './application/block-sender.handler.js';
import { ListBlockedSendersHandler } from './application/list-blocked-senders.handler.js';
import { UnblockSenderHandler } from './application/unblock-sender.handler.js';
import { DeleteMessageHandler } from './application/delete-message.handler.js';
import { ListMessagesHandler } from './application/list-messages.handler.js';
import { LoadMessageContentHandler } from './application/load-message-content.handler.js';
import { LoadMessageHandler } from './application/load-message.handler.js';
import { UpdateMessageHandler } from './application/update-message.handler.js';
import { BlockedSenderRepository } from './domain/blocked-sender.repository.js';
import { MessageRepository } from './domain/message.repository.js';
import { SenderHasher } from './domain/sender-hasher.js';
import { HmacSenderHasher } from './infrastructure/hmac-sender-hasher.js';
import { PrismaBlockedSenderRepository } from './infrastructure/prisma-blocked-sender.repository.js';
import { PrismaMessageRepository } from './infrastructure/prisma-message.repository.js';
import { BlockedSenderController } from './presentation/blocked-sender.controller.js';
import { MessageController } from './presentation/message.controller.js';

/** Reading and organizing stored mail over HTTP, and the blocked sender list. */
@Module({
  imports: [IdentityModule],
  controllers: [MessageController, BlockedSenderController],
  providers: [
    ListMessagesHandler,
    LoadMessageHandler,
    LoadMessageContentHandler,
    UpdateMessageHandler,
    ApplyMessageBatchHandler,
    DeleteMessageHandler,
    ListBlockedSendersHandler,
    BlockSenderHandler,
    UnblockSenderHandler,
    { provide: MessageRepository, useClass: PrismaMessageRepository },
    {
      provide: BlockedSenderRepository,
      useClass: PrismaBlockedSenderRepository,
    },
    { provide: SenderHasher, useClass: HmacSenderHasher },
  ],
})
export class MessageModule {}

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { ApplyMessageBatchHandler } from './application/apply-message-batch.handler.js';
import { DeleteMessageHandler } from './application/delete-message.handler.js';
import { ListMessagesHandler } from './application/list-messages.handler.js';
import { LoadMessageContentHandler } from './application/load-message-content.handler.js';
import { LoadMessageHandler } from './application/load-message.handler.js';
import { UpdateMessageHandler } from './application/update-message.handler.js';
import { MessageRepository } from './domain/message.repository.js';
import { PrismaMessageRepository } from './infrastructure/prisma-message.repository.js';
import { MessageController } from './presentation/message.controller.js';

/** Reading and organizing stored mail over HTTP. */
@Module({
  imports: [IdentityModule],
  controllers: [MessageController],
  providers: [
    ListMessagesHandler,
    LoadMessageHandler,
    LoadMessageContentHandler,
    UpdateMessageHandler,
    ApplyMessageBatchHandler,
    DeleteMessageHandler,
    { provide: MessageRepository, useClass: PrismaMessageRepository },
  ],
})
export class MessageModule {}

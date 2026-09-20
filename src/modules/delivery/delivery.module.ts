import { Module } from '@nestjs/common';
import { MessageModule } from '../message/message.module.js';
import { CheckRecipientHandler } from './application/check-recipient.handler.js';
import { RecipientDirectory } from './domain/recipient-directory.js';
import { LmtpListener } from './infrastructure/lmtp-listener.js';
import { PrismaRecipientDirectory } from './infrastructure/prisma-recipient-directory.js';

@Module({
  imports: [MessageModule],
  providers: [
    CheckRecipientHandler,
    LmtpListener,
    { provide: RecipientDirectory, useClass: PrismaRecipientDirectory },
  ],
  /** Started by the delivery process, see delivery.ts. */
  exports: [LmtpListener],
})
export class DeliveryModule {}

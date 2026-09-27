import { Module } from '@nestjs/common';
import { AnalyzeInboundMailHandler } from './application/analyze-inbound-mail.handler.js';
import { DeliverInboundMailHandler } from './application/deliver-inbound-mail.handler.js';
import { ContentSealer } from './domain/content-sealer.js';
import { InboundMailStore } from './domain/inbound-mail.store.js';
import { MailAuthenticator } from './domain/mail-authenticator.js';
import { MailParser } from './domain/mail-parser.js';
import { SenderHasher } from './domain/sender-hasher.js';
import { HmacSenderHasher } from './infrastructure/hmac-sender-hasher.js';
import { MailauthAuthenticator } from './infrastructure/mailauth-authenticator.js';
import { PostalMimeParser } from './infrastructure/postal-mime-parser.js';
import { PrismaInboundMailStore } from './infrastructure/prisma-inbound-mail.store.js';
import { SodiumContentSealer } from './infrastructure/sodium-content-sealer.js';

/** The receiving side of the message module, run by the delivery process; no HTTP. */
@Module({
  providers: [
    AnalyzeInboundMailHandler,
    DeliverInboundMailHandler,
    { provide: MailParser, useClass: PostalMimeParser },
    { provide: MailAuthenticator, useClass: MailauthAuthenticator },
    { provide: SenderHasher, useClass: HmacSenderHasher },
    { provide: ContentSealer, useClass: SodiumContentSealer },
    { provide: InboundMailStore, useClass: PrismaInboundMailStore },
  ],
  /** Reach them through message.api.ts. */
  exports: [AnalyzeInboundMailHandler, DeliverInboundMailHandler],
})
export class InboundMailModule {}

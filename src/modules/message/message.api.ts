/** What other modules may use from the message module. */
export { AnalyzeInboundMailHandler } from './application/analyze-inbound-mail.handler.js';
export { DeliverInboundMailHandler } from './application/deliver-inbound-mail.handler.js';
export type {
  InboundMail,
  InboundRecipient,
  MailEnvelope,
} from './domain/inbound-mail.js';
export type { MessageAliasId, MessageOwnerId } from './domain/message.js';

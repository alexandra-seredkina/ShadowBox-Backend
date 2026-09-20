import type { MessageAliasId, MessageOwnerId } from './message.js';
import type { AuthResults } from './threat.js';

export interface MailSender {
  readonly name: string;
  readonly address: string;
  /** Lower-case Unicode form of the address domain; empty when there is none. */
  readonly domain: string;
}

/** A link as the reader sees it: where it points and what it says. */
export interface MailLink {
  readonly href: string;
  readonly text: string;
}

export interface MailAttachment {
  readonly filename: string;
  readonly mimeType: string;
  /** Pictures referenced from the HTML body rather than files to download. */
  readonly isInline: boolean;
}

/** What the server reads from a message before sealing it; never stored as is. */
export interface ParsedMail {
  readonly from: MailSender;
  readonly subject: string;
  /** Plain text of the body, or the HTML body without markup. */
  readonly bodyText: string;
  readonly links: readonly MailLink[];
  readonly attachments: readonly MailAttachment[];
}

/** SMTP facts the MTA passed on, needed to check SPF. */
export interface MailEnvelope {
  readonly clientIp: string;
  readonly helo: string;
  /** Null for bounces, sent with an empty MAIL FROM. */
  readonly mailFrom: string | null;
}

/** A received message, read once and then delivered to each of its recipients. */
export interface InboundMail {
  readonly raw: Uint8Array;
  readonly parsed: ParsedMail;
  readonly auth: AuthResults;
}

export interface InboundRecipient {
  readonly ownerId: MessageOwnerId;
  readonly aliasId: MessageAliasId;
}

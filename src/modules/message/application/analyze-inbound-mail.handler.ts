import { Injectable } from '@nestjs/common';
import type { InboundMail, MailEnvelope } from '../domain/inbound-mail.js';
import { MailAuthenticator } from '../domain/mail-authenticator.js';
import { MailParser } from '../domain/mail-parser.js';

/** Reads a received message once, before it is delivered to each recipient. Stores nothing. */
@Injectable()
export class AnalyzeInboundMailHandler {
  constructor(
    private readonly parser: MailParser,
    private readonly authenticator: MailAuthenticator,
  ) {}

  async execute(command: {
    readonly raw: Uint8Array;
    readonly envelope: MailEnvelope;
  }): Promise<InboundMail> {
    const [parsed, auth] = await Promise.all([
      this.parser.parse(command.raw),
      this.authenticator.verify(command.raw, command.envelope),
    ]);
    return { raw: command.raw, parsed, auth };
  }
}

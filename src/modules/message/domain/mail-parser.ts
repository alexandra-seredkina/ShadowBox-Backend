import type { ParsedMail } from './inbound-mail.js';

export abstract class MailParser {
  abstract parse(raw: Uint8Array): Promise<ParsedMail>;
}

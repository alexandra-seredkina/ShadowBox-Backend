import type { MailEnvelope } from './inbound-mail.js';
import type { AuthResults } from './threat.js';

/** SPF, DKIM and DMARC of a message as it arrived. */
export abstract class MailAuthenticator {
  abstract verify(
    raw: Uint8Array,
    envelope: MailEnvelope,
  ): Promise<AuthResults>;
}

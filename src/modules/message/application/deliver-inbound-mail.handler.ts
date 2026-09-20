import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import { ContentSealer } from '../domain/content-sealer.js';
import type { InboundMail, InboundRecipient } from '../domain/inbound-mail.js';
import { InboundMailStore } from '../domain/inbound-mail.store.js';
import { roundUpToKiB } from '../domain/message.js';
import { previewOf } from '../domain/preview.js';
import { SenderHash, SenderHasher } from '../domain/sender-hasher.js';
import { assessThreat } from '../domain/threat.js';

/**
 * Seals a message for one recipient and stores it. Plaintext stays in memory:
 * only the sealed preview and body, the threat verdict and a keyed hash of
 * the sender are written.
 */
@Injectable()
export class DeliverInboundMailHandler {
  constructor(
    private readonly store: InboundMailStore,
    private readonly sealer: ContentSealer,
    private readonly senderHasher: SenderHasher,
    private readonly clock: Clock,
  ) {}

  async execute(command: {
    readonly mail: InboundMail;
    readonly recipient: InboundRecipient;
  }): Promise<void> {
    const { mail, recipient } = command;
    const mailbox = await this.store.findMailbox(
      recipient.ownerId,
      recipient.aliasId,
    );
    if (mailbox === null) {
      return;
    }
    const sender = this.senderOf(mail, recipient);
    const isKnownSender =
      sender !== null &&
      (await this.store.isKnownSender(recipient.ownerId, sender));
    const threat = assessThreat({
      auth: mail.auth,
      isKnownSender,
      from: mail.parsed.from,
      links: mail.parsed.links,
      attachments: mail.parsed.attachments,
    });
    const preview = Buffer.from(JSON.stringify(previewOf(mail.parsed)));
    const encryptedPreview = this.sealer.seal(mailbox.publicKey, preview);
    preview.fill(0);
    await this.store.save({
      ownerId: recipient.ownerId,
      aliasId: recipient.aliasId,
      receivedAt: this.clock.now(),
      sizeBytes: roundUpToKiB(mail.raw.length),
      threat,
      encryptedPreview,
      body: this.sealer.seal(mailbox.publicKey, mail.raw),
      sender,
    });
  }

  private senderOf(
    mail: InboundMail,
    recipient: InboundRecipient,
  ): SenderHash | null {
    const address = mail.parsed.from.address;
    return address === ''
      ? null
      : this.senderHasher.hash(recipient.ownerId, address);
  }
}

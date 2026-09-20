import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import { Clock } from '../../../shared/kernel/clock.js';
import { parseRecipientAddress, Recipient } from '../domain/recipient.js';
import { RecipientDirectory } from '../domain/recipient-directory.js';

/** Answers RCPT TO: null means "reject", whatever the reason. */
@Injectable()
export class CheckRecipientHandler {
  constructor(
    private readonly directory: RecipientDirectory,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  async execute(rawAddress: string): Promise<Recipient | null> {
    const address = parseRecipientAddress(rawAddress, this.config.mailDomain);
    if (address === null) {
      return null;
    }
    return this.directory.findDeliverable(address, this.clock.now());
  }
}

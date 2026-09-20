import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import type { MessageOwnerId } from '../domain/message.js';
import { SenderHash, SenderHasher } from '../domain/sender-hasher.js';

const DOMAIN_LABEL = 'shadowbox/known-sender/v1\0';

/**
 * The account id is part of the input, so the same sender gives
 * unrelated hashes in different accounts and a dump cannot be joined across them.
 */
@Injectable()
export class HmacSenderHasher implements SenderHasher {
  constructor(private readonly config: AppConfig) {}

  hash(ownerId: MessageOwnerId, address: string): SenderHash {
    const hash = createHmac('sha256', this.config.senderHashKey)
      .update(DOMAIN_LABEL)
      .update(ownerId, 'utf8')
      .update('\0')
      .update(address.trim().toLowerCase(), 'utf8')
      .digest();
    return { hash, keyVersion: this.config.senderHashKeyVersion };
  }
}

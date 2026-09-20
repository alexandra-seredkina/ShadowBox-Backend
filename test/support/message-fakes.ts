import { randomBytes } from 'node:crypto';
import sodium from 'sodium-native';
import { SodiumContentSealer } from '../../src/modules/message/infrastructure/sodium-content-sealer.js';
import type {
  MailEnvelope,
  ParsedMail,
} from '../../src/modules/message/domain/inbound-mail.js';
import {
  InboundMailStore,
  Mailbox,
  NewMessage,
} from '../../src/modules/message/domain/inbound-mail.store.js';
import { MailAuthenticator } from '../../src/modules/message/domain/mail-authenticator.js';
import { MailParser } from '../../src/modules/message/domain/mail-parser.js';
import type {
  MessageAliasId,
  MessageOwnerId,
} from '../../src/modules/message/domain/message.js';
import {
  SenderHash,
  SenderHasher,
} from '../../src/modules/message/domain/sender-hasher.js';
import type { AuthResults } from '../../src/modules/message/domain/threat.js';
import { SequentialRandom } from './kernel-fakes.js';

/** Real sealing with predictable randomness; the blobs open as in production. */
export function testSealer(): SodiumContentSealer {
  return new SodiumContentSealer(new SequentialRandom());
}

export function randomKeyPair(): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  const publicKey = new Uint8Array(sodium.crypto_box_PUBLICKEYBYTES);
  const secretKey = new Uint8Array(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_box_seed_keypair(publicKey, secretKey, randomBytes(32));
  return { publicKey, secretKey };
}

export function parsedMail(overrides: Partial<ParsedMail> = {}): ParsedMail {
  return {
    from: {
      name: 'Shop',
      address: 'news@shop.example',
      domain: 'shop.example',
    },
    subject: 'Your order',
    bodyText: 'Thanks for your order.',
    links: [],
    attachments: [],
    ...overrides,
  };
}

export const PASSED_AUTH: AuthResults = {
  spf: 'pass',
  dkim: 'pass',
  dmarc: 'pass',
};

/** Returns the same parse for any input. */
export class FixedMailParser extends MailParser {
  constructor(public parsed: ParsedMail = parsedMail()) {
    super();
  }

  parse(): Promise<ParsedMail> {
    return Promise.resolve(this.parsed);
  }
}

/** Never asks DNS; remembers the envelope it was given. */
export class FixedMailAuthenticator extends MailAuthenticator {
  lastEnvelope: MailEnvelope | null = null;

  constructor(public results: AuthResults = PASSED_AUTH) {
    super();
  }

  verify(_raw: Uint8Array, envelope: MailEnvelope): Promise<AuthResults> {
    this.lastEnvelope = envelope;
    return Promise.resolve(this.results);
  }
}

/** Keeps the owner and address readable in assertions instead of hashing them. */
export class PlainSenderHasher extends SenderHasher {
  hash(ownerId: MessageOwnerId, address: string): SenderHash {
    return {
      hash: Buffer.from(`${ownerId}:${address.toLowerCase()}`),
      keyVersion: 1,
    };
  }
}

export class InMemoryInboundMailStore extends InboundMailStore {
  readonly saved: NewMessage[] = [];
  private readonly mailboxes = new Map<string, Mailbox>();
  private readonly knownSenders = new Set<string>();
  /** Saving for this address fails, as a broken database would. */
  failingAliasId: string | null = null;

  addMailbox(ownerId: string, aliasId: string, publicKey: Uint8Array): void {
    this.mailboxes.set(`${ownerId}/${aliasId}`, { publicKey });
  }

  findMailbox(
    ownerId: MessageOwnerId,
    aliasId: MessageAliasId,
  ): Promise<Mailbox | null> {
    return Promise.resolve(this.mailboxes.get(`${ownerId}/${aliasId}`) ?? null);
  }

  isKnownSender(ownerId: MessageOwnerId, sender: SenderHash): Promise<boolean> {
    return Promise.resolve(this.knownSenders.has(senderKey(ownerId, sender)));
  }

  save(message: NewMessage): Promise<void> {
    if (message.aliasId === this.failingAliasId) {
      return Promise.reject(new Error('Database unavailable'));
    }
    this.saved.push(message);
    if (message.sender !== null) {
      this.knownSenders.add(senderKey(message.ownerId, message.sender));
    }
    return Promise.resolve();
  }
}

function senderKey(ownerId: string, sender: SenderHash): string {
  return `${ownerId}/${Buffer.from(sender.hash).toString('hex')}`;
}

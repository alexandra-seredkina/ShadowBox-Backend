import { FixedClock } from '../../../../test/support/kernel-fakes.js';
import {
  InMemoryInboundMailStore,
  parsedMail,
  PASSED_AUTH,
  PlainSenderHasher,
  randomKeyPair,
  testSealer,
} from '../../../../test/support/message-fakes.js';
import { openEncryptedBlob } from '../../../../test/support/open-encrypted-blob.js';
import type { InboundMail, InboundRecipient } from '../domain/inbound-mail.js';
import type { NewMessage } from '../domain/inbound-mail.store.js';
import type { MessageAliasId, MessageOwnerId } from '../domain/message.js';
import { DeliverInboundMailHandler } from './deliver-inbound-mail.handler.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const RECIPIENT: InboundRecipient = {
  ownerId: 'account-1' as MessageOwnerId,
  aliasId: 'alias-1' as MessageAliasId,
};

function inboundMail(overrides: Partial<InboundMail> = {}): InboundMail {
  return {
    raw: Buffer.from('Subject: Your order\r\n\r\nThanks for your order.\r\n'),
    parsed: parsedMail(),
    auth: PASSED_AUTH,
    ...overrides,
  };
}

describe('DeliverInboundMailHandler', () => {
  let store: InMemoryInboundMailStore;
  let handler: DeliverInboundMailHandler;
  let keys: { publicKey: Uint8Array; secretKey: Uint8Array };

  beforeEach(() => {
    keys = randomKeyPair();
    store = new InMemoryInboundMailStore();
    store.addMailbox(RECIPIENT.ownerId, RECIPIENT.aliasId, keys.publicKey);
    handler = new DeliverInboundMailHandler(
      store,
      testSealer(),
      new PlainSenderHasher(),
      new FixedClock(NOW),
    );
  });

  function deliver(mail: InboundMail = inboundMail()): Promise<void> {
    return handler.execute({ mail, recipient: RECIPIENT });
  }

  function firstSaved(): NewMessage {
    const [message] = store.saved;
    if (message === undefined) {
      throw new Error('Nothing was saved');
    }
    return message;
  }

  it('seals the preview so that only the owner can read it', async () => {
    await deliver();

    const preview = openEncryptedBlob(firstSaved().encryptedPreview, keys);
    expect(JSON.parse(Buffer.from(preview).toString('utf8'))).toEqual({
      from: { name: 'Shop', address: 'news@shop.example' },
      subject: 'Your order',
      snippet: 'Thanks for your order.',
      hasAttachments: false,
    });
  });

  it('seals the raw message as the body', async () => {
    const mail = inboundMail();

    await deliver(mail);

    const body = openEncryptedBlob(firstSaved().body, keys);
    expect(Buffer.from(body).equals(Buffer.from(mail.raw))).toBe(true);
  });

  it('records the time of receipt and a size rounded up to 1 KiB', async () => {
    await deliver(inboundMail({ raw: new Uint8Array(1025) }));

    expect(store.saved[0]).toMatchObject({
      ownerId: RECIPIENT.ownerId,
      aliasId: RECIPIENT.aliasId,
      receivedAt: NOW,
      sizeBytes: 2048,
    });
  });

  it('flags the first message from a sender and trusts the next one', async () => {
    await deliver();
    await deliver();

    expect(store.saved.map((message) => message.threat)).toEqual([
      { verdict: 'caution', markers: ['UNKNOWN_SENDER'], auth: PASSED_AUTH },
      { verdict: 'safe', markers: [], auth: PASSED_AUTH },
    ]);
  });

  it('remembers the sender only as a hash', async () => {
    await deliver();

    expect(store.saved[0]?.sender).toEqual({
      hash: Buffer.from('account-1:news@shop.example'),
      keyVersion: 1,
    });
  });

  it('treats a message without a sender address as unknown and remembers nothing', async () => {
    const parsed = parsedMail({
      from: { name: '', address: '', domain: '' },
    });

    await deliver(inboundMail({ parsed }));
    await deliver(inboundMail({ parsed }));

    expect(store.saved.map((message) => message.sender)).toEqual([null, null]);
    expect(store.saved[1]?.threat.markers).toEqual(['UNKNOWN_SENDER']);
  });

  it('marks failed DMARC as dangerous', async () => {
    await deliver(
      inboundMail({ auth: { spf: 'fail', dkim: 'none', dmarc: 'fail' } }),
    );

    expect(store.saved[0]?.threat).toMatchObject({
      verdict: 'danger',
      markers: ['UNKNOWN_SENDER', 'AUTH_FAILED'],
    });
  });

  it('sends mail from a blocked sender to spam and still checks it', async () => {
    store.block(RECIPIENT.ownerId, 'NEWS@shop.example');

    await deliver();

    expect(firstSaved()).toMatchObject({
      isFromBlockedSender: true,
      threat: { verdict: 'caution', markers: ['UNKNOWN_SENDER'] },
    });
  });

  it('drops the message when the address stopped being deliverable', async () => {
    await handler.execute({
      mail: inboundMail(),
      recipient: { ...RECIPIENT, aliasId: 'alias-gone' as MessageAliasId },
    });

    expect(store.saved).toEqual([]);
  });
});

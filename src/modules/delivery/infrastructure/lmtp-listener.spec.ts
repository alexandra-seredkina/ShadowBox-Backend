import { Readable } from 'node:stream';
import type { PinoLogger } from 'nestjs-pino';
import { InMemoryRecipientDirectory } from '../../../../test/support/delivery-fakes.js';
import {
  FixedClock,
  SequentialRandom,
} from '../../../../test/support/kernel-fakes.js';
import { LmtpTestClient } from '../../../../test/support/lmtp-test-client.js';
import {
  FixedMailAuthenticator,
  FixedMailParser,
  InMemoryInboundMailStore,
  PlainSenderHasher,
} from '../../../../test/support/message-fakes.js';
import { createTestConfig } from '../../../../test/support/test-config.js';
import { AnalyzeInboundMailHandler } from '../../message/application/analyze-inbound-mail.handler.js';
import { DeliverInboundMailHandler } from '../../message/application/deliver-inbound-mail.handler.js';
import { SodiumContentSealer } from '../../message/infrastructure/sodium-content-sealer.js';
import { CheckRecipientHandler } from '../application/check-recipient.handler.js';
import { MAX_RECIPIENTS_PER_MESSAGE } from '../domain/recipient.js';
import { LmtpListener, readLimited } from './lmtp-listener.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const KNOWN = 'k7f3mz9q2a@shadowbox.test';
const SECOND = 'b2c3d4e5f6@shadowbox.test';
const PUBLIC_KEY = new Uint8Array(32).fill(9);

function silentLogger(): PinoLogger {
  return {
    setContext: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;
}

describe('LmtpListener', () => {
  let directory: InMemoryRecipientDirectory;
  let store: InMemoryInboundMailStore;
  let authenticator: FixedMailAuthenticator;
  let listener: LmtpListener;
  let client: LmtpTestClient;

  beforeEach(async () => {
    directory = new InMemoryRecipientDirectory();
    store = new InMemoryInboundMailStore();
    for (const localPart of ['k7f3mz9q2a', 'b2c3d4e5f6']) {
      const recipient = directory.add(localPart);
      store.addMailbox(recipient.accountId, recipient.aliasId, PUBLIC_KEY);
    }
    authenticator = new FixedMailAuthenticator();
    const config = createTestConfig({ lmtpPort: 0 });
    const clock = new FixedClock(NOW);
    listener = new LmtpListener(
      config,
      new CheckRecipientHandler(directory, config, clock),
      new AnalyzeInboundMailHandler(new FixedMailParser(), authenticator),
      new DeliverInboundMailHandler(
        store,
        new SodiumContentSealer(new SequentialRandom()),
        new PlainSenderHasher(),
        clock,
      ),
      silentLogger(),
    );
    const { port } = await listener.listen();
    client = await LmtpTestClient.connect(port);
  });

  afterEach(async () => {
    client.close();
    await listener.onApplicationShutdown();
  });

  it('greets as an LMTP server without AUTH or STARTTLS', async () => {
    const reply = await client.command('LHLO mta.example');

    expect(reply.code).toBe(250);
    expect(client.lastLines).toContain('SIZE 26214400');
    expect(client.lastLines).toContain(
      'XFORWARD NAME ADDR PORT PROTO HELO IDENT SOURCE',
    );
    expect(client.lastLines.join(' ')).not.toMatch(/AUTH|STARTTLS/);
  });

  it('accepts a deliverable address', async () => {
    const [reply] = await client.envelope([KNOWN]);

    expect(reply).toEqual({ code: 250, text: 'Accepted' });
  });

  it('refuses every undeliverable address with the same reply', async () => {
    const replies = await client.envelope([
      'zzzzzzzzzz@shadowbox.test',
      'kage@shadowbox.test',
      'k7f3mz9q2a@example.com',
    ]);

    expect(replies).toEqual([
      { code: 550, text: '5.1.1 Recipient address rejected' },
      { code: 550, text: '5.1.1 Recipient address rejected' },
      { code: 550, text: '5.1.1 Recipient address rejected' },
    ]);
  });

  it('looks up only addresses the server could have issued', async () => {
    await client.envelope(['kage@shadowbox.test', 'k7f3mz9q2a@example.com']);

    expect(directory.lookups).toBe(0);
  });

  it(`stops at ${MAX_RECIPIENTS_PER_MESSAGE} recipients per message`, async () => {
    for (let i = 0; i < MAX_RECIPIENTS_PER_MESSAGE; i += 1) {
      directory.add(`a${String(i).padStart(9, '0')}`);
    }
    const addresses = Array.from(
      { length: MAX_RECIPIENTS_PER_MESSAGE },
      (_, i) => `a${String(i).padStart(9, '0')}@shadowbox.test`,
    );
    await client.envelope(addresses);

    const extra = await client.command(`RCPT TO:<${KNOWN}>`);
    const repeated = await client.command(`RCPT TO:<${addresses[0] ?? ''}>`);

    expect(extra).toEqual({ code: 452, text: '4.5.3 Too many recipients' });
    expect(repeated.code).toBe(250);
  });

  it('refuses a message announced above the size limit', async () => {
    await client.command('LHLO mta.example');

    const reply = await client.command(
      `MAIL FROM:<sender@example.com> SIZE=${25 * 1024 * 1024 + 1}`,
    );

    expect(reply.code).toBe(552);
  });

  it('delivers accepted mail and confirms each recipient', async () => {
    await client.envelope([KNOWN, SECOND]);
    await client.command('DATA');

    const replies = await client.data('Subject: hi\r\n\r\nhello\r\n', 2);

    expect(replies).toEqual([
      { code: 250, text: '2.0.0 Delivered' },
      { code: 250, text: '2.0.0 Delivered' },
    ]);
    expect(store.saved.map((message) => message.aliasId)).toEqual([
      'alias-k7f3mz9q2a',
      'alias-b2c3d4e5f6',
    ]);
  });

  it('defers only the recipient whose copy could not be stored', async () => {
    store.failingAliasId = 'alias-k7f3mz9q2a';
    await client.envelope([KNOWN, SECOND]);
    await client.command('DATA');

    const replies = await client.data('Subject: hi\r\n\r\nhello\r\n', 2);

    expect(replies).toEqual([
      { code: 451, text: '4.3.0 Temporary failure, try again later' },
      { code: 250, text: '2.0.0 Delivered' },
    ]);
  });

  it('checks the sender with the client data forwarded by the MTA', async () => {
    await client.command('LHLO mta.example');
    await client.command(
      'XFORWARD ADDR=192.0.2.10 NAME=mail.example.com HELO=Mail.Example.com',
    );
    await client.command('MAIL FROM:<news@example.com>');
    await client.command(`RCPT TO:<${KNOWN}>`);
    await client.command('DATA');

    await client.data('Subject: hi\r\n\r\nhello\r\n', 1);

    expect(authenticator.lastEnvelope).toEqual({
      clientIp: '192.0.2.10',
      helo: 'mail.example.com',
      mailFrom: 'news@example.com',
    });
  });

  it('passes a bounce on without a sender address', async () => {
    await client.command('LHLO mta.example');
    await client.command('MAIL FROM:<>');
    await client.command(`RCPT TO:<${KNOWN}>`);
    await client.command('DATA');

    await client.data('Subject: bounce\r\n\r\nundelivered\r\n', 1);

    expect(authenticator.lastEnvelope?.mailFrom).toBeNull();
  });
});

describe('readLimited', () => {
  it('returns the whole message within the limit', async () => {
    const message = await readLimited(
      Readable.from([Buffer.from('abc'), Buffer.from('def')]),
      6,
    );

    expect(message?.toString()).toBe('abcdef');
  });

  it('gives null past the limit and still drains the stream', async () => {
    const stream = Readable.from([Buffer.from('abc'), Buffer.from('def')]);

    const message = await readLimited(stream, 5);

    expect(message).toBeNull();
    expect(stream.readableEnded).toBe(true);
  });
});

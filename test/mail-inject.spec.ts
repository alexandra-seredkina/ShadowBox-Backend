import type { PinoLogger } from 'nestjs-pino';
import {
  headerSender,
  injectMail,
  InjectOptions,
  largeMessage,
  toDataPayload,
} from '../scripts/mail-inject.js';
import { CheckRecipientHandler } from '../src/modules/delivery/application/check-recipient.handler.js';
import { LmtpListener } from '../src/modules/delivery/infrastructure/lmtp-listener.js';
import { AnalyzeInboundMailHandler } from '../src/modules/message/application/analyze-inbound-mail.handler.js';
import { DeliverInboundMailHandler } from '../src/modules/message/application/deliver-inbound-mail.handler.js';
import { PostalMimeParser } from '../src/modules/message/infrastructure/postal-mime-parser.js';
import { InMemoryRecipientDirectory } from './support/delivery-fakes.js';
import { FixedClock } from './support/kernel-fakes.js';
import {
  FixedMailAuthenticator,
  InMemoryInboundMailStore,
  PlainSenderHasher,
  testSealer,
} from './support/message-fakes.js';
import { createTestConfig } from './support/test-config.js';

const ADDRESS = 'k7f3mz9q2a@shadowbox.test';
const MESSAGE = Buffer.from(
  'From: "Shop" <news@shop.example>\nSubject: hi\n\n.hidden line\nbye\n',
);

function silentLogger(): PinoLogger {
  return {
    setContext: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;
}

describe('mail:inject', () => {
  let store: InMemoryInboundMailStore;
  let authenticator: FixedMailAuthenticator;
  let listener: LmtpListener;
  let port: number;

  beforeEach(async () => {
    const directory = new InMemoryRecipientDirectory();
    const recipient = directory.add('k7f3mz9q2a');
    store = new InMemoryInboundMailStore();
    store.addMailbox(
      recipient.accountId,
      recipient.aliasId,
      new Uint8Array(32).fill(9),
    );
    authenticator = new FixedMailAuthenticator();
    const config = createTestConfig({ lmtpPort: 0 });
    const clock = new FixedClock(new Date('2020-01-15T12:00:00Z'));
    listener = new LmtpListener(
      config,
      new CheckRecipientHandler(directory, config, clock),
      new AnalyzeInboundMailHandler(new PostalMimeParser(), authenticator),
      new DeliverInboundMailHandler(
        store,
        testSealer(),
        new PlainSenderHasher(),
        clock,
      ),
      silentLogger(),
    );
    ({ port } = await listener.listen());
  });

  afterEach(async () => {
    await listener.onApplicationShutdown();
  });

  function inject(overrides: Partial<InjectOptions> = {}) {
    return injectMail({
      host: '127.0.0.1',
      port,
      from: 'news@shop.example',
      to: [ADDRESS],
      message: MESSAGE,
      clientIp: null,
      ...overrides,
    });
  }

  it('delivers a message and reports each recipient', async () => {
    const results = await inject({
      to: [ADDRESS, 'zzzzzzzzzz@shadowbox.test'],
    });

    expect(results).toEqual([
      {
        address: 'zzzzzzzzzz@shadowbox.test',
        code: 550,
        text: '5.1.1 Recipient address rejected',
      },
      { address: ADDRESS, code: 250, text: '2.0.0 Delivered' },
    ]);
    expect(store.saved).toHaveLength(1);
  });

  it('forwards the client address for SPF when asked', async () => {
    await inject({ clientIp: '192.0.2.10', from: '' });

    expect(authenticator.lastEnvelope).toEqual({
      clientIp: '192.0.2.10',
      helo: 'mail-inject.localhost',
      mailFrom: null,
    });
  });

  it('gets a 20 MiB message through', async () => {
    const results = await inject({ message: largeMessage(20) });

    expect(results).toEqual([
      { address: ADDRESS, code: 250, text: '2.0.0 Delivered' },
    ]);
    expect(store.saved[0]?.sizeBytes).toBeGreaterThan(20 * 1024 * 1024);
  });

  it('is refused above the 25 MiB limit', async () => {
    const [result] = await inject({ message: largeMessage(26) });

    expect(result?.code).toBe(552);
    expect(store.saved).toEqual([]);
  });
});

describe('toDataPayload', () => {
  it('uses CRLF, doubles leading dots and ends the data', () => {
    expect(toDataPayload(MESSAGE).toString()).toBe(
      'From: "Shop" <news@shop.example>\r\nSubject: hi\r\n\r\n..hidden line\r\nbye\r\n.\r\n',
    );
  });
});

describe('headerSender', () => {
  it('takes the address of the From header', () => {
    expect(headerSender(MESSAGE)).toBe('news@shop.example');
    expect(headerSender(Buffer.from('From: plain@example.com\n\nhi'))).toBe(
      'plain@example.com',
    );
    expect(headerSender(Buffer.from('Subject: none\n\nhi'))).toBe('');
  });
});

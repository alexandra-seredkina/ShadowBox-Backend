import { Readable } from 'node:stream';
import type { PinoLogger } from 'nestjs-pino';
import { InMemoryRecipientDirectory } from '../../../../test/support/delivery-fakes.js';
import { FixedClock } from '../../../../test/support/kernel-fakes.js';
import { LmtpTestClient } from '../../../../test/support/lmtp-test-client.js';
import { createTestConfig } from '../../../../test/support/test-config.js';
import { CheckRecipientHandler } from '../application/check-recipient.handler.js';
import { MAX_RECIPIENTS_PER_MESSAGE } from '../domain/recipient.js';
import { LmtpListener, readLimited } from './lmtp-listener.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const KNOWN = 'k7f3mz9q2a@shadowbox.test';

function silentLogger(): PinoLogger {
  return {
    setContext: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;
}

describe('LmtpListener', () => {
  let directory: InMemoryRecipientDirectory;
  let listener: LmtpListener;
  let client: LmtpTestClient;

  beforeEach(async () => {
    directory = new InMemoryRecipientDirectory();
    directory.add('k7f3mz9q2a');
    const config = createTestConfig({ lmtpPort: 0 });
    listener = new LmtpListener(
      config,
      new CheckRecipientHandler(directory, config, new FixedClock(NOW)),
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

  it('defers accepted mail per recipient until it can be processed', async () => {
    await client.envelope([KNOWN]);
    await client.command('DATA');

    const replies = await client.data('Subject: hi\r\n\r\nhello\r\n', 1);

    expect(replies).toEqual([
      { code: 451, text: '4.3.0 Temporary failure, try again later' },
    ]);
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

import type { PinoLogger } from 'nestjs-pino';
import sodium from 'sodium-native';
import { z } from 'zod';
import { NodeSecureRandom } from '../src/infrastructure/crypto/crypto.module.js';
import type { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { CheckRecipientHandler } from '../src/modules/delivery/application/check-recipient.handler.js';
import { LmtpListener } from '../src/modules/delivery/infrastructure/lmtp-listener.js';
import { PrismaRecipientDirectory } from '../src/modules/delivery/infrastructure/prisma-recipient-directory.js';
import { AnalyzeInboundMailHandler } from '../src/modules/message/application/analyze-inbound-mail.handler.js';
import { DeliverInboundMailHandler } from '../src/modules/message/application/deliver-inbound-mail.handler.js';
import { HmacSenderHasher } from '../src/modules/message/infrastructure/hmac-sender-hasher.js';
import { PostalMimeParser } from '../src/modules/message/infrastructure/postal-mime-parser.js';
import { PrismaInboundMailStore } from '../src/modules/message/infrastructure/prisma-inbound-mail.store.js';
import { SodiumContentSealer } from '../src/modules/message/infrastructure/sodium-content-sealer.js';
import type { EncryptedBlob } from '../src/shared/kernel/encrypted-blob.js';
import { FixedClock } from './support/kernel-fakes.js';
import { LmtpTestClient } from './support/lmtp-test-client.js';
import { FixedMailAuthenticator } from './support/message-fakes.js';
import { openEncryptedBlob } from './support/open-encrypted-blob.js';
import { createTestConfig } from './support/test-config.js';
import { createTestPrisma, resetDatabase } from './support/test-database.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const ADDRESS = 'k7f3mz9q2a@shadowbox.test';
const SUBJECT = 'Quarterly report';
const MESSAGE = [
  'From: "Bank" <statements@bank.example>',
  `To: ${ADDRESS}`,
  `Subject: ${SUBJECT}`,
  '',
  'Your statement is ready.',
  '',
].join('\r\n');

/** The key pair of the API test vectors (seed 32 x 0x42). */
function vectorKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  const publicKey = new Uint8Array(sodium.crypto_box_PUBLICKEYBYTES);
  const secretKey = new Uint8Array(sodium.crypto_box_SECRETKEYBYTES);
  sodium.crypto_box_seed_keypair(
    publicKey,
    secretKey,
    new Uint8Array(32).fill(0x42),
  );
  return { publicKey, secretKey };
}

const storedBlobSchema = z.object({
  sealedKey: z.string(),
  nonce: z.string(),
  ciphertext: z.string(),
});

/** Turns the JSON form of a blob, as stored for previews, back into bytes. */
function blobFromJson(json: unknown): EncryptedBlob {
  const blob = storedBlobSchema.parse(json);
  return {
    v: 1,
    alg: 'x25519-xchacha20poly1305',
    sealedKey: Buffer.from(blob.sealedKey, 'base64url'),
    nonce: Buffer.from(blob.nonce, 'base64url'),
    ciphertext: Buffer.from(blob.ciphertext, 'base64url'),
  };
}

function silentLogger(): PinoLogger {
  return {
    setContext: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;
}

describe('Inbound mail (LMTP to PostgreSQL)', () => {
  const keys = vectorKeyPair();
  let prisma: PrismaService;
  let listener: LmtpListener;
  let client: LmtpTestClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const bytes = new Uint8Array(32);
    await prisma.account.create({
      data: {
        login: 'kage',
        authKeyHash: 'x',
        kdfAlgorithm: 'argon2id13',
        kdfSalt: bytes,
        kdfOpsLimit: 3,
        kdfMemLimitBytes: 67108864,
        publicKey: Uint8Array.from(keys.publicKey),
        encryptedPrivateKeyNonce: bytes,
        encryptedPrivateKeyCiphertext: bytes,
        recoveryEncryptedPrivateKeyNonce: bytes,
        recoveryEncryptedPrivateKeyCiphertext: bytes,
        folders: { create: [{ kind: 'system', systemRole: 'inbox' }] },
        aliases: {
          create: {
            localPart: 'k7f3mz9q2a',
            domain: 'shadowbox.test',
            kind: 'permanent',
          },
        },
      },
    });
    const config = createTestConfig({ lmtpPort: 0 });
    const clock = new FixedClock(NOW);
    listener = new LmtpListener(
      config,
      new CheckRecipientHandler(
        new PrismaRecipientDirectory(prisma),
        config,
        clock,
      ),
      new AnalyzeInboundMailHandler(
        new PostalMimeParser(),
        new FixedMailAuthenticator(),
      ),
      new DeliverInboundMailHandler(
        new PrismaInboundMailStore(prisma),
        new SodiumContentSealer(new NodeSecureRandom()),
        new HmacSenderHasher(config),
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

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function send(): Promise<void> {
    await client.envelope([ADDRESS]);
    await client.command('DATA');
    const [reply] = await client.data(MESSAGE, 1);
    expect(reply).toEqual({ code: 250, text: '2.0.0 Delivered' });
  }

  it('stores a message that only the owner can open', async () => {
    await send();

    const row = await prisma.message.findFirstOrThrow();
    const preview = openEncryptedBlob(blobFromJson(row.encryptedPreview), keys);
    const body = openEncryptedBlob(
      {
        v: 1,
        alg: 'x25519-xchacha20poly1305',
        sealedKey: row.bodySealedKey,
        nonce: row.bodyNonce,
        ciphertext: row.bodyCiphertext,
      },
      keys,
    );

    expect(JSON.parse(Buffer.from(preview).toString('utf8'))).toEqual({
      from: { name: 'Bank', address: 'statements@bank.example' },
      subject: SUBJECT,
      snippet: 'Your statement is ready.',
      hasAttachments: false,
    });
    expect(Buffer.from(body).toString('utf8')).toBe(MESSAGE);
    expect(row).toMatchObject({
      receivedAt: NOW,
      sizeBytes: 1024,
      threatVerdict: 'caution',
      threatMarkers: ['UNKNOWN_SENDER'],
    });
  });

  it('writes neither the content nor the sender in the clear', async () => {
    await send();

    const dump = JSON.stringify(
      [await prisma.message.findMany(), await prisma.knownSender.findMany()],
      (_key, value: unknown) =>
        value instanceof Uint8Array
          ? Buffer.from(value).toString('latin1')
          : value,
    );
    expect(dump).not.toContain(SUBJECT);
    expect(dump).not.toContain('statement');
    expect(dump).not.toContain('bank.example');
  });

  it('knows the sender from the second message on', async () => {
    await send();
    await send();

    const rows = await prisma.message.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((row) => row.threatVerdict)).toEqual(['caution', 'safe']);
  });
});

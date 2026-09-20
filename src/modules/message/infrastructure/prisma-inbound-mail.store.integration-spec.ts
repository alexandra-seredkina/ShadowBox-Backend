import {
  createTestPrisma,
  resetDatabase,
} from '../../../../test/support/test-database.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { EncryptedBlob } from '../../../shared/kernel/encrypted-blob.js';
import type { NewMessage } from '../domain/inbound-mail.store.js';
import type { MessageAliasId, MessageOwnerId } from '../domain/message.js';
import type { SenderHash } from '../domain/sender-hasher.js';
import { PrismaInboundMailStore } from './prisma-inbound-mail.store.js';

const NOW = new Date('2020-01-15T12:00:00.123Z');
const PUBLIC_KEY = new Uint8Array(32).fill(7);
const SENDER: SenderHash = { hash: new Uint8Array(32).fill(5), keyVersion: 2 };

function blob(fill: number, length: number): EncryptedBlob {
  return {
    v: 1,
    alg: 'x25519-xchacha20poly1305',
    sealedKey: new Uint8Array(80).fill(fill),
    nonce: new Uint8Array(24).fill(fill),
    ciphertext: new Uint8Array(length).fill(fill),
  };
}

describe('PrismaInboundMailStore', () => {
  let prisma: PrismaService;
  let store: PrismaInboundMailStore;
  let ownerId: MessageOwnerId;
  let inboxId: string;

  async function createAccount(login: string): Promise<MessageOwnerId> {
    const bytes = new Uint8Array(32);
    const account = await prisma.account.create({
      data: {
        login,
        authKeyHash: 'x',
        kdfAlgorithm: 'argon2id13',
        kdfSalt: bytes,
        kdfOpsLimit: 3,
        kdfMemLimitBytes: 67108864,
        publicKey: PUBLIC_KEY,
        encryptedPrivateKeyNonce: bytes,
        encryptedPrivateKeyCiphertext: bytes,
        recoveryEncryptedPrivateKeyNonce: bytes,
        recoveryEncryptedPrivateKeyCiphertext: bytes,
        folders: {
          create: [
            { kind: 'system', systemRole: 'inbox' },
            { kind: 'system', systemRole: 'spam' },
            { kind: 'system', systemRole: 'trash' },
          ],
        },
      },
      select: { id: true },
    });
    return account.id as MessageOwnerId;
  }

  async function createAlias(
    localPart: string,
    fields: { status?: 'active' | 'disabled'; folderId?: string | null } = {},
  ): Promise<MessageAliasId> {
    const alias = await prisma.alias.create({
      data: {
        accountId: ownerId,
        localPart,
        domain: 'shadowbox.test',
        kind: 'permanent',
        status: fields.status ?? 'active',
        folderId: fields.folderId ?? null,
      },
      select: { id: true },
    });
    return alias.id as MessageAliasId;
  }

  function newMessage(
    aliasId: MessageAliasId,
    overrides: Partial<NewMessage> = {},
  ): NewMessage {
    return {
      ownerId,
      aliasId,
      receivedAt: NOW,
      sizeBytes: 2048,
      threat: {
        verdict: 'danger',
        markers: ['UNKNOWN_SENDER', 'LINK_MISMATCH'],
        auth: { spf: 'pass', dkim: 'none', dmarc: 'fail' },
      },
      encryptedPreview: blob(1, 60),
      body: blob(2, 1500),
      sender: SENDER,
      ...overrides,
    };
  }

  beforeAll(() => {
    prisma = createTestPrisma();
    store = new PrismaInboundMailStore(prisma);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    ownerId = await createAccount('kage');
    const inbox = await prisma.folder.findFirstOrThrow({
      where: { accountId: ownerId, systemRole: 'inbox' },
    });
    inboxId = inbox.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('findMailbox', () => {
    it("gives the owner's public key for an active address", async () => {
      const aliasId = await createAlias('k7f3mz9q2a');

      const mailbox = await store.findMailbox(ownerId, aliasId);

      expect(Buffer.from(mailbox?.publicKey ?? [])).toEqual(
        Buffer.from(PUBLIC_KEY),
      );
    });

    it('finds nothing for a disabled or foreign address', async () => {
      const disabled = await createAlias('k7f3mz9q2b', { status: 'disabled' });
      const own = await createAlias('k7f3mz9q2c');
      const other = await createAccount('other');

      await expect(store.findMailbox(ownerId, disabled)).resolves.toBeNull();
      await expect(store.findMailbox(other, own)).resolves.toBeNull();
    });
  });

  describe('save', () => {
    it('stores the sealed message in the inbox with its verdict', async () => {
      const aliasId = await createAlias('k7f3mz9q2a');

      await store.save(newMessage(aliasId));

      const row = await prisma.message.findFirstOrThrow();
      expect(row).toMatchObject({
        accountId: ownerId,
        folderId: inboxId,
        aliasId,
        receivedAt: NOW,
        isRead: false,
        sizeBytes: 2048,
        threatVerdict: 'danger',
        threatMarkers: ['UNKNOWN_SENDER', 'LINK_MISMATCH'],
        spfResult: 'pass',
        dkimResult: 'none',
        dmarcResult: 'fail',
        encryptedPreview: {
          v: 1,
          alg: 'x25519-xchacha20poly1305',
          sealedKey: Buffer.alloc(80, 1).toString('base64url'),
          nonce: Buffer.alloc(24, 1).toString('base64url'),
          ciphertext: Buffer.alloc(60, 1).toString('base64url'),
        },
        bodyBlobVersion: 1,
      });
      expect(Buffer.from(row.bodyCiphertext)).toEqual(Buffer.alloc(1500, 2));
      expect(Buffer.from(row.bodySealedKey)).toEqual(Buffer.alloc(80, 2));
      expect(Buffer.from(row.bodyNonce)).toEqual(Buffer.alloc(24, 2));
    });

    it("files the message in the address's own folder", async () => {
      const folder = await prisma.folder.create({
        data: { accountId: ownerId, kind: 'custom', encryptedName: {} },
      });
      const aliasId = await createAlias('k7f3mz9q2a', { folderId: folder.id });

      await store.save(newMessage(aliasId));

      const row = await prisma.message.findFirstOrThrow();
      expect(row.folderId).toBe(folder.id);
    });

    it('marks when the address last received mail', async () => {
      const aliasId = await createAlias('k7f3mz9q2a');

      await store.save(newMessage(aliasId));

      const alias = await prisma.alias.findUniqueOrThrow({
        where: { id: aliasId },
      });
      expect(alias.lastReceivedAt).toEqual(NOW);
    });

    it('remembers the sender once, so the next message is known', async () => {
      const aliasId = await createAlias('k7f3mz9q2a');

      await expect(store.isKnownSender(ownerId, SENDER)).resolves.toBe(false);
      await store.save(newMessage(aliasId));
      await store.save(newMessage(aliasId));

      await expect(store.isKnownSender(ownerId, SENDER)).resolves.toBe(true);
      expect(await prisma.knownSender.findMany()).toEqual([
        {
          accountId: ownerId,
          senderHash: Uint8Array.from(SENDER.hash),
          hashKeyVersion: 2,
        },
      ]);
      expect(await prisma.message.count()).toBe(2);
    });

    it('keeps senders apart per account', async () => {
      const aliasId = await createAlias('k7f3mz9q2a');
      const other = await createAccount('other');

      await store.save(newMessage(aliasId));

      await expect(store.isKnownSender(other, SENDER)).resolves.toBe(false);
    });

    it('stores a message without a sender address', async () => {
      const aliasId = await createAlias('k7f3mz9q2a');

      await store.save(newMessage(aliasId, { sender: null }));

      expect(await prisma.knownSender.count()).toBe(0);
      expect(await prisma.message.count()).toBe(1);
    });

    it('refuses an address of another account and stores nothing', async () => {
      const aliasId = await createAlias('k7f3mz9q2a');
      const other = await createAccount('other');

      await expect(
        store.save(newMessage(aliasId, { ownerId: other })),
      ).rejects.toThrow();
      expect(await prisma.message.count()).toBe(0);
    });
  });
});

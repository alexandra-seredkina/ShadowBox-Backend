import {
  createTestPrisma,
  resetDatabase,
} from '../../../../test/support/test-database.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { FolderId, FolderOwnerId } from '../domain/folder.js';
import {
  FolderIsSystemError,
  FolderLimitExceededError,
} from '../domain/folder.errors.js';
import { PrismaFolderRepository } from './prisma-folder.repository.js';

const NAME: EncryptedBlobJson = {
  v: 1,
  alg: 'x25519-xchacha20poly1305',
  sealedKey: Buffer.alloc(80, 1).toString('base64url'),
  nonce: Buffer.alloc(24, 2).toString('base64url'),
  ciphertext: Buffer.alloc(30, 3).toString('base64url'),
};
const RENAMED: EncryptedBlobJson = {
  ...NAME,
  ciphertext: Buffer.alloc(30, 4).toString('base64url'),
};

describe('PrismaFolderRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaFolderRepository;
  let kage: FolderOwnerId;
  let other: FolderOwnerId;

  async function account(login: string): Promise<FolderOwnerId> {
    const bytes = new Uint8Array(32);
    const row = await prisma.account.create({
      data: {
        login,
        authKeyHash: 'x',
        kdfAlgorithm: 'argon2id13',
        kdfSalt: bytes,
        kdfOpsLimit: 3,
        kdfMemLimitBytes: 67108864,
        publicKey: bytes,
        encryptedPrivateKeyNonce: bytes,
        encryptedPrivateKeyCiphertext: bytes,
        recoveryEncryptedPrivateKeyNonce: bytes,
        recoveryEncryptedPrivateKeyCiphertext: bytes,
        folders: {
          create: [
            { kind: 'system', systemRole: 'trash' },
            { kind: 'system', systemRole: 'inbox' },
            { kind: 'system', systemRole: 'spam' },
          ],
        },
      },
      select: { id: true },
    });
    return row.id as FolderOwnerId;
  }

  async function systemFolder(
    ownerId: FolderOwnerId,
    role: 'inbox' | 'spam',
  ): Promise<FolderId> {
    const row = await prisma.folder.findFirstOrThrow({
      where: { accountId: ownerId, systemRole: role },
      select: { id: true },
    });
    return row.id as FolderId;
  }

  async function message(
    ownerId: FolderOwnerId,
    folderId: string,
    isRead: boolean,
  ): Promise<string> {
    const bytes = new Uint8Array(8);
    const row = await prisma.message.create({
      data: {
        accountId: ownerId,
        folderId,
        receivedAt: new Date('2020-01-15T12:00:00Z'),
        isRead,
        sizeBytes: 1024,
        threatVerdict: 'safe',
        spfResult: 'none',
        dkimResult: 'none',
        dmarcResult: 'none',
        encryptedPreview: { ...NAME },
        bodyBlobVersion: 1,
        bodySealedKey: bytes,
        bodyNonce: bytes,
        bodyCiphertext: bytes,
      },
      select: { id: true },
    });
    return row.id;
  }

  beforeAll(() => {
    prisma = createTestPrisma();
    repository = new PrismaFolderRepository(prisma);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    kage = await account('kage');
    other = await account('other');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lists system folders in role order, then custom ones, with unread counts', async () => {
    const custom = await repository.create(kage, NAME, 50);
    const inbox = await systemFolder(kage, 'inbox');
    await message(kage, inbox, false);
    await message(kage, inbox, false);
    await message(kage, inbox, true);
    await message(kage, custom.id, false);

    const folders = await repository.list(kage);

    expect(
      folders.map((folder) =>
        folder.kind === 'system' ? folder.systemRole : 'custom',
      ),
    ).toEqual(['inbox', 'spam', 'trash', 'custom']);
    expect(folders.map((folder) => folder.unreadCount)).toEqual([2, 0, 0, 1]);
    expect(folders[3]).toMatchObject({ kind: 'custom', encryptedName: NAME });
  });

  it('keeps the custom folder limit under concurrent creation', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => repository.create(kage, NAME, 3)),
    );

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(3);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(FolderLimitExceededError);
      }
    }
  });

  it('renames an own custom folder only', async () => {
    const custom = await repository.create(kage, NAME, 50);

    await expect(
      repository.rename(kage, custom.id, RENAMED),
    ).resolves.toMatchObject({
      encryptedName: RENAMED,
    });
    await expect(
      repository.rename(other, custom.id, RENAMED),
    ).resolves.toBeNull();
    await expect(
      repository.rename(kage, await systemFolder(kage, 'spam'), RENAMED),
    ).rejects.toBeInstanceOf(FolderIsSystemError);
  });

  it('moves messages to the inbox and unpins addresses when deleting', async () => {
    const custom = await repository.create(kage, NAME, 50);
    const moved = await message(kage, custom.id, false);
    const alias = await prisma.alias.create({
      data: {
        accountId: kage,
        localPart: 'pinnedaaaa',
        domain: 'shadowbox.test',
        kind: 'permanent',
        folderId: custom.id,
      },
      select: { id: true },
    });

    await expect(repository.delete(kage, custom.id)).resolves.toBe(true);

    const inbox = await systemFolder(kage, 'inbox');
    await expect(
      prisma.message.findUniqueOrThrow({ where: { id: moved } }),
    ).resolves.toMatchObject({ folderId: inbox });
    await expect(
      prisma.alias.findUniqueOrThrow({ where: { id: alias.id } }),
    ).resolves.toMatchObject({ folderId: null });
    await expect(
      prisma.folder.count({ where: { id: custom.id } }),
    ).resolves.toBe(0);
  });

  it('never deletes a system folder or someone else’s folder', async () => {
    const custom = await repository.create(kage, NAME, 50);

    await expect(repository.delete(other, custom.id)).resolves.toBe(false);
    await expect(
      repository.delete(kage, await systemFolder(kage, 'inbox')),
    ).rejects.toBeInstanceOf(FolderIsSystemError);
    await expect(
      prisma.folder.count({ where: { accountId: kage } }),
    ).resolves.toBe(4);
  });
});

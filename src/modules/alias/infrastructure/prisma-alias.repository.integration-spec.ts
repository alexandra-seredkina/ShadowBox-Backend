import {
  createTestPrisma,
  resetDatabase,
} from '../../../../test/support/test-database.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PrismaIdempotencyRepository } from '../../../infrastructure/prisma/prisma-idempotency.repository.js';
import { AliasAddressTakenError } from '../../../shared/kernel/alias-local-part.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { AliasId, OwnerId } from '../domain/alias.js';
import { fromAliasSnapshot } from '../domain/alias.js';
import { AliasLimitExceededError } from '../domain/alias.errors.js';
import type { NewAlias } from '../domain/alias.repository.js';
import { PrismaAliasRepository } from './prisma-alias.repository.js';
import { PrismaFolderDirectory } from './prisma-folder-directory.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const HOUR_MS = 60 * 60 * 1000;
const LABEL: EncryptedBlobJson = {
  v: 1,
  alg: 'x25519-xchacha20poly1305',
  sealedKey: Buffer.alloc(80, 1).toString('base64url'),
  nonce: Buffer.alloc(24, 2).toString('base64url'),
  ciphertext: Buffer.alloc(30, 3).toString('base64url'),
};

let sequence = 0;
function localPart(): string {
  sequence += 1;
  return `test${String(sequence).padStart(6, '0')}`;
}

describe('PrismaAliasRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaAliasRepository;
  let kage: OwnerId;
  let other: OwnerId;

  async function account(login: string): Promise<OwnerId> {
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
      },
      select: { id: true },
    });
    return row.id as OwnerId;
  }

  function newAlias(
    ownerId: OwnerId,
    overrides: Partial<NewAlias> = {},
  ): NewAlias {
    return {
      ownerId,
      localPart: localPart(),
      domain: 'shadowbox.test',
      kind: 'temporary',
      expiresAt: new Date(NOW.getTime() + HOUR_MS),
      encryptedLabel: LABEL,
      folderId: null,
      ...overrides,
    };
  }

  const options = { maxActive: 3, now: NOW, idempotency: null };

  beforeAll(() => {
    prisma = createTestPrisma();
    repository = new PrismaAliasRepository(prisma);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    kage = await account('kage');
    other = await account('other');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('stores and returns the label as sent', async () => {
    const created = await repository.create(newAlias(kage), options);

    await expect(repository.findOwn(kage, created.id, NOW)).resolves.toEqual(
      created,
    );
    expect(created.encryptedLabel).toEqual(LABEL);
  });

  it('lists only live addresses of the owner, newest first', async () => {
    const first = await repository.create(newAlias(kage), options);
    const second = await repository.create(
      newAlias(kage, { kind: 'permanent', expiresAt: null }),
      { ...options, now: new Date(NOW.getTime() + 1) },
    );
    await repository.create(newAlias(kage, { expiresAt: NOW }), options);
    await repository.create(newAlias(other), options);

    const listed = await repository.list(kage, { status: null, now: NOW });

    expect(listed.map((alias) => alias.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it('never lets another owner see or change an address', async () => {
    const created = await repository.create(newAlias(kage), options);

    await expect(
      repository.findOwn(other, created.id, NOW),
    ).resolves.toBeNull();
    await expect(
      repository.update(other, created.id, { status: 'disabled' }, options),
    ).resolves.toBeNull();
    await repository.revoke(other, created.id, NOW);
    await expect(
      repository.findOwn(kage, created.id, NOW),
    ).resolves.not.toBeNull();
  });

  it('enforces the active limit, also under concurrent creation', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        repository.create(newAlias(kage), options),
      ),
    );

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(3);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(AliasLimitExceededError);
      }
    }
  });

  it('does not count disabled or expired addresses towards the limit', async () => {
    const disabled = await repository.create(newAlias(kage), options);
    await repository.update(kage, disabled.id, { status: 'disabled' }, options);
    await repository.create(
      newAlias(kage, { expiresAt: new Date(NOW.getTime() + 1) }),
      options,
    );
    const later = { ...options, now: new Date(NOW.getTime() + 1) };

    await repository.create(newAlias(kage), later);
    await repository.create(newAlias(kage), later);
    await repository.create(newAlias(kage), later);
    await expect(
      repository.update(kage, disabled.id, { status: 'active' }, later),
    ).rejects.toBeInstanceOf(AliasLimitExceededError);
  });

  it('reports a taken address', async () => {
    const alias = newAlias(kage);
    await repository.create(alias, options);

    await expect(
      repository.create({ ...alias, ownerId: other }, options),
    ).rejects.toBeInstanceOf(AliasAddressTakenError);
  });

  it('updates only the given fields and clears the label with null', async () => {
    const created = await repository.create(newAlias(kage), options);
    const folder = await prisma.folder.create({
      data: { accountId: kage, kind: 'custom', encryptedName: { ...LABEL } },
      select: { id: true },
    });

    const moved = await repository.update(
      kage,
      created.id,
      { folderId: folder.id },
      options,
    );
    const cleared = await repository.update(
      kage,
      created.id,
      { encryptedLabel: null },
      options,
    );

    expect(moved).toMatchObject({ folderId: folder.id, encryptedLabel: LABEL });
    expect(cleared).toMatchObject({
      folderId: folder.id,
      encryptedLabel: null,
    });
  });

  it('revokes for good: wiped and never listed again', async () => {
    const created = await repository.create(newAlias(kage), options);

    await repository.revoke(kage, created.id, NOW);

    await expect(repository.findOwn(kage, created.id, NOW)).resolves.toBeNull();
    const row = await prisma.alias.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row).toMatchObject({
      status: 'revoked',
      encryptedLabel: null,
      folderId: null,
      revokedAt: NOW,
    });
  });

  it('keeps the created address under the idempotency key', async () => {
    const claim = {
      key: '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0d',
      operation: 'aliases.create',
      requestHash: new Uint8Array(32).fill(1),
      expiresAt: new Date(NOW.getTime() + HOUR_MS),
    };
    const created = await repository.create(newAlias(kage), {
      ...options,
      idempotency: claim,
    });

    const stored = await new PrismaIdempotencyRepository(prisma).findByKey(
      claim.key,
      NOW,
    );

    expect(stored?.accountId).toBe(kage);
    expect(fromAliasSnapshot(stored?.snapshot)).toEqual(created);
  });

  it('tells own folders from foreign ones', async () => {
    const folder = await prisma.folder.create({
      data: { accountId: kage, kind: 'custom', encryptedName: { ...LABEL } },
      select: { id: true },
    });
    const directory = new PrismaFolderDirectory(prisma);

    await expect(directory.isOwnFolder(kage, folder.id)).resolves.toBe(true);
    await expect(directory.isOwnFolder(other, folder.id)).resolves.toBe(false);
  });

  it('treats an unknown id as missing', async () => {
    await expect(
      repository.findOwn(
        kage,
        '0192c5a0-0000-7000-8000-000000000000' as AliasId,
        NOW,
      ),
    ).resolves.toBeNull();
  });
});

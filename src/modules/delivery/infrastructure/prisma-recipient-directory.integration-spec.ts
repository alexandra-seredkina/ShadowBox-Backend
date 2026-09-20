import {
  createTestPrisma,
  resetDatabase,
} from '../../../../test/support/test-database.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PrismaRecipientDirectory } from './prisma-recipient-directory.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const DOMAIN = 'shadowbox.test';

describe('PrismaRecipientDirectory', () => {
  let prisma: PrismaService;
  let directory: PrismaRecipientDirectory;
  let accountId: string;

  async function alias(
    localPart: string,
    fields: {
      status?: 'active' | 'disabled' | 'revoked';
      kind?: 'permanent' | 'temporary';
      expiresAt?: Date | null;
      accountId?: string | null;
    } = {},
  ): Promise<string> {
    const row = await prisma.alias.create({
      data: {
        localPart,
        domain: DOMAIN,
        kind: fields.kind ?? 'permanent',
        status: fields.status ?? 'active',
        expiresAt: fields.expiresAt ?? null,
        accountId:
          fields.accountId === undefined ? accountId : fields.accountId,
        revokedAt: fields.status === 'revoked' ? NOW : null,
      },
      select: { id: true },
    });
    return row.id;
  }

  function find(
    localPart: string,
  ): ReturnType<PrismaRecipientDirectory['findDeliverable']> {
    return directory.findDeliverable({ localPart, domain: DOMAIN }, NOW);
  }

  beforeAll(() => {
    prisma = createTestPrisma();
    directory = new PrismaRecipientDirectory(prisma);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const bytes = new Uint8Array(32);
    const account = await prisma.account.create({
      data: {
        login: 'kage',
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
    accountId = account.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('finds an active permanent address and its account', async () => {
    const aliasId = await alias('aaaaaaaaaa');

    expect(await find('aaaaaaaaaa')).toEqual({ aliasId, accountId });
  });

  it('finds a temporary address before it expires', async () => {
    const aliasId = await alias('bbbbbbbbbb', {
      kind: 'temporary',
      expiresAt: new Date(NOW.getTime() + 1000),
    });

    expect(await find('bbbbbbbbbb')).toEqual({ aliasId, accountId });
  });

  it('does not deliver to a disabled address', async () => {
    await alias('cccccccccc', { status: 'disabled' });

    expect(await find('cccccccccc')).toBeNull();
  });

  it('does not deliver to a revoked address', async () => {
    await alias('dddddddddd', { status: 'revoked' });

    expect(await find('dddddddddd')).toBeNull();
  });

  it('does not deliver to an expired address the job has not revoked yet', async () => {
    await alias('eeeeeeeeee', { kind: 'temporary', expiresAt: NOW });

    expect(await find('eeeeeeeeee')).toBeNull();
  });

  it('does not deliver to an address of a deleted account', async () => {
    await alias('ffffffffff', { status: 'revoked', accountId: null });

    expect(await find('ffffffffff')).toBeNull();
  });

  it('does not deliver to an address that was never issued', async () => {
    expect(await find('gggggggggg')).toBeNull();
  });
});

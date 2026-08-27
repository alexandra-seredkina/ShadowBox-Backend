import {
  createTestPrisma,
  resetDatabase,
} from '../../../../test/support/test-database.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { Login } from '../domain/login.js';
import { PrismaAccountKdfRepository } from './prisma-account-kdf.repository.js';

const SALT = new Uint8Array(16).fill(5);
const BYTES = new Uint8Array(32).fill(1);

describe('PrismaAccountKdfRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaAccountKdfRepository;

  beforeAll(() => {
    prisma = createTestPrisma();
    repository = new PrismaAccountKdfRepository(prisma);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await prisma.account.create({
      data: {
        login: 'kage',
        authKeyHash: '$argon2id$v=19$m=65536,t=3,p=1$placeholder',
        kdfAlgorithm: 'argon2id13',
        kdfSalt: SALT,
        kdfOpsLimit: 3,
        kdfMemLimitBytes: 67108864,
        publicKey: BYTES,
        encryptedPrivateKeyNonce: BYTES,
        encryptedPrivateKeyCiphertext: BYTES,
        recoveryEncryptedPrivateKeyNonce: BYTES,
        recoveryEncryptedPrivateKeyCiphertext: BYTES,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('finds the KDF parameters of an account', async () => {
    const params = await repository.findByLogin('kage' as Login);

    expect(params).toMatchObject({
      algorithm: 'argon2id13',
      opsLimit: 3,
      memLimitBytes: 67108864,
    });
    expect(Buffer.from(params?.salt ?? [])).toEqual(Buffer.from(SALT));
  });

  it('returns null for an unknown login', async () => {
    await expect(repository.findByLogin('nobody' as Login)).resolves.toBeNull();
  });
});

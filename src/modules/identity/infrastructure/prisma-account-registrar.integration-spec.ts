import {
  createTestPrisma,
  resetDatabase,
} from '../../../../test/support/test-database.js';
import { PrismaIdempotencyRepository } from '../../../infrastructure/prisma/prisma-idempotency.repository.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  IdempotencyClaim,
  IdempotencyKeyTakenError,
} from '../../../shared/kernel/idempotency.js';
import {
  AliasAddressTakenError,
  LoginTakenError,
} from '../domain/identity.errors.js';
import { standardKdfParams } from '../domain/kdf-params.js';
import type { Login } from '../domain/login.js';
import {
  fromRegistrationSnapshot,
  REGISTER_OPERATION,
  Registration,
} from '../domain/registration.js';
import { draftSession } from '../domain/session.js';
import { PrismaAccountRegistrar } from './prisma-account-registrar.js';
import { PrismaAccountRepository } from './prisma-account.repository.js';

const NOW = new Date('2020-01-15T12:00:00Z');

function bytes(length: number, fill: number): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

function registration(login: string, localPart: string): Registration {
  return {
    account: {
      login: login as Login,
      authKeyHash: '$argon2id$v=19$m=65536,t=3,p=1$placeholder',
      kdf: standardKdfParams(bytes(16, 2)),
      publicKey: bytes(32, 3),
      encryptedPrivateKey: { nonce: bytes(24, 4), ciphertext: bytes(48, 5) },
      recoveryEncryptedPrivateKey: {
        nonce: bytes(24, 6),
        ciphertext: bytes(48, 7),
      },
    },
    firstAlias: { localPart, domain: 'shadowbox.test' },
    session: draftSession({
      token: bytes(32, login.length),
      ip: { hash: bytes(32, 8), keyVersion: 1 },
      isIpBound: true,
      device: 'Firefox · Linux',
      now: NOW,
    }),
  };
}

const claim: IdempotencyClaim = {
  key: '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0d',
  operation: REGISTER_OPERATION,
  requestHash: bytes(32, 9),
  expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
};

describe('PrismaAccountRegistrar', () => {
  let prisma: PrismaService;
  let registrar: PrismaAccountRegistrar;

  beforeAll(() => {
    prisma = createTestPrisma();
    registrar = new PrismaAccountRegistrar(prisma);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates the account with its folders, first address and session', async () => {
    const result = await registrar.register(
      registration('kage', 'k7f3mz9q2a'),
      null,
    );

    const folders = await prisma.folder.findMany({
      where: { accountId: result.account.id },
      select: { kind: true, systemRole: true },
      orderBy: { systemRole: 'asc' },
    });
    expect(folders).toEqual([
      { kind: 'system', systemRole: 'inbox' },
      { kind: 'system', systemRole: 'spam' },
      { kind: 'system', systemRole: 'trash' },
    ]);
    expect(result.firstAlias).toMatchObject({
      localPart: 'k7f3mz9q2a',
      domain: 'shadowbox.test',
      kind: 'permanent',
      status: 'active',
    });
    await expect(
      prisma.session.count({ where: { accountId: result.account.id } }),
    ).resolves.toBe(1);
  });

  it('stores the keys the client sent', async () => {
    const { account } = await registrar.register(
      registration('kage', 'k7f3mz9q2a'),
      null,
    );

    const row = await prisma.account.findUniqueOrThrow({
      where: { id: account.id },
      select: { publicKey: true, recoveryEncryptedPrivateKeyCiphertext: true },
    });
    expect(Buffer.from(row.publicKey)).toEqual(Buffer.from(bytes(32, 3)));
    expect(Buffer.from(row.recoveryEncryptedPrivateKeyCiphertext)).toEqual(
      Buffer.from(bytes(48, 7)),
    );
  });

  it('reports a taken login and leaves nothing behind', async () => {
    await registrar.register(registration('kage', 'aaaaaaaaaa'), null);

    await expect(
      registrar.register(registration('kage', 'bbbbbbbbbb'), null),
    ).rejects.toBeInstanceOf(LoginTakenError);
    await expect(prisma.alias.count()).resolves.toBe(1);
  });

  it('reports a taken address and rolls the account back', async () => {
    await registrar.register(registration('kage', 'aaaaaaaaaa'), null);

    await expect(
      registrar.register(registration('other', 'aaaaaaaaaa'), null),
    ).rejects.toBeInstanceOf(AliasAddressTakenError);
    await expect(prisma.account.count()).resolves.toBe(1);
  });

  it('keeps the answer under the idempotency key', async () => {
    const result = await registrar.register(
      registration('kage', 'aaaaaaaaaa'),
      claim,
    );

    const stored = await new PrismaIdempotencyRepository(prisma).findByKey(
      claim.key,
      NOW,
    );
    expect(stored).toMatchObject({
      operation: REGISTER_OPERATION,
      accountId: result.account.id,
    });
    expect(fromRegistrationSnapshot(stored?.snapshot)).toEqual(result);
  });

  it('treats an expired record as absent', async () => {
    await registrar.register(registration('kage', 'aaaaaaaaaa'), claim);

    await expect(
      new PrismaIdempotencyRepository(prisma).findByKey(
        claim.key,
        claim.expiresAt,
      ),
    ).resolves.toBeNull();
  });

  it('reports a reused idempotency key and rolls the account back', async () => {
    await registrar.register(registration('kage', 'aaaaaaaaaa'), claim);

    await expect(
      registrar.register(registration('other', 'bbbbbbbbbb'), claim),
    ).rejects.toBeInstanceOf(IdempotencyKeyTakenError);
    await expect(prisma.account.count()).resolves.toBe(1);
  });

  it('exposes the credentials of the new account', async () => {
    const { account } = await registrar.register(
      registration('kage', 'aaaaaaaaaa'),
      null,
    );

    await expect(
      new PrismaAccountRepository(prisma).findCredentialsById(account.id),
    ).resolves.toEqual({
      id: account.id,
      authKeyHash: '$argon2id$v=19$m=65536,t=3,p=1$placeholder',
      isIpBindingEnabled: true,
    });
  });
});

import {
  createTestPrisma,
  resetDatabase,
} from '../../../../test/support/test-database.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { AccountId } from '../domain/account.js';
import { standardKdfParams } from '../domain/kdf-params.js';
import type { Login } from '../domain/login.js';
import {
  draftSession,
  hashSessionToken,
  SessionId,
} from '../domain/session.js';
import { PrismaAccountRegistrar } from './prisma-account-registrar.js';
import { PrismaAccountRepository } from './prisma-account.repository.js';
import { PrismaSessionRepository } from './prisma-session.repository.js';

const NOW = new Date('2020-01-15T12:00:00Z');

function bytes(length: number, fill: number): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

function draft(fill: number): ReturnType<typeof draftSession> {
  return draftSession({
    token: bytes(32, fill),
    ip: { hash: bytes(32, 8), keyVersion: 1 },
    isIpBound: true,
    device: 'Firefox · Linux',
    now: NOW,
  });
}

describe('PrismaSessionRepository and PrismaAccountRepository', () => {
  let prisma: PrismaService;
  let sessions: PrismaSessionRepository;
  let accounts: PrismaAccountRepository;
  let accountId: AccountId;

  beforeAll(() => {
    prisma = createTestPrisma();
    sessions = new PrismaSessionRepository(prisma);
    accounts = new PrismaAccountRepository(prisma);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const result = await new PrismaAccountRegistrar(prisma).register(
      {
        account: {
          login: 'kage' as Login,
          authKeyHash: '$argon2id$v=19$m=65536,t=3,p=1$old',
          kdf: standardKdfParams(bytes(16, 2)),
          publicKey: bytes(32, 3),
          encryptedPrivateKey: {
            nonce: bytes(24, 4),
            ciphertext: bytes(48, 5),
          },
          recoveryEncryptedPrivateKey: {
            nonce: bytes(24, 6),
            ciphertext: bytes(48, 7),
          },
        },
        firstAlias: { localPart: 'aaaaaaaaaa', domain: 'shadowbox.test' },
        session: draft(1),
      },
      null,
    );
    accountId = result.account.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('finds a session by the hash of its token', async () => {
    const id = await sessions.create(accountId, draft(2));

    const found = await sessions.findByTokenHash(
      hashSessionToken(bytes(32, 2)),
    );

    expect(found).toMatchObject({
      id,
      accountId,
      isIpBound: true,
      reauthUntil: null,
      expiresAt: draft(2).expiresAt,
    });
    expect(Buffer.from(found?.ip.hash ?? [])).toEqual(
      Buffer.from(bytes(32, 8)),
    );
  });

  it('rotates the token when granting reauth', async () => {
    const id = await sessions.create(accountId, draft(2));
    const until = new Date(NOW.getTime() + 300_000);

    await sessions.grantReauth(id, {
      tokenHash: hashSessionToken(bytes(32, 3)),
      reauthUntil: until,
    });

    await expect(
      sessions.findByTokenHash(hashSessionToken(bytes(32, 2))),
    ).resolves.toBeNull();
    await expect(
      sessions.findByTokenHash(hashSessionToken(bytes(32, 3))),
    ).resolves.toMatchObject({ id, reauthUntil: until });
  });

  it('records activity and deletes sessions', async () => {
    const id = await sessions.create(accountId, draft(2));
    const later = new Date(NOW.getTime() + 600_000);

    await sessions.touch(id, later);
    await expect(
      sessions.findByTokenHash(hashSessionToken(bytes(32, 2))),
    ).resolves.toMatchObject({ lastActiveAt: later });

    await sessions.deleteByTokenHash(hashSessionToken(bytes(32, 2)));
    await sessions.delete('0192c5a0-0000-7000-8000-000000000000' as SessionId);
    await expect(prisma.session.count({ where: { id } })).resolves.toBe(0);
  });

  it('loads the account summary with its active address count', async () => {
    await expect(accounts.loadSummary(accountId)).resolves.toMatchObject({
      id: accountId,
      login: 'kage',
      isIpBindingEnabled: true,
      activeAliases: 1,
    });
  });

  it('loads the keys the client stored at sign-up', async () => {
    const keys = await accounts.loadKeys(accountId);

    expect(Buffer.from(keys.publicKey)).toEqual(Buffer.from(bytes(32, 3)));
    expect(Buffer.from(keys.encryptedPrivateKey.ciphertext)).toEqual(
      Buffer.from(bytes(48, 5)),
    );
    expect(keys.kdf).toMatchObject({ algorithm: 'argon2id13', opsLimit: 3 });
  });

  it('finds credentials by login and replaces the hash', async () => {
    await accounts.updateAuthKeyHash(
      accountId,
      '$argon2id$v=19$m=65536,t=3,p=1$new',
    );

    await expect(
      accounts.findCredentialsByLogin('kage' as Login),
    ).resolves.toEqual({
      id: accountId,
      authKeyHash: '$argon2id$v=19$m=65536,t=3,p=1$new',
      isIpBindingEnabled: true,
    });
    await expect(
      accounts.findCredentialsByLogin('nobody' as Login),
    ).resolves.toBeNull();
  });
});

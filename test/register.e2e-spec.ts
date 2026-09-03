import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AccountRepository } from '../src/modules/identity/domain/account.repository.js';
import { AccountRegistrar } from '../src/modules/identity/domain/account-registrar.js';
import { AuthKeyHasher } from '../src/modules/identity/domain/auth-key-hasher.js';
import { PowChallengeRepository } from '../src/modules/identity/domain/pow-challenge.repository.js';
import { SessionRepository } from '../src/modules/identity/domain/session.repository.js';
import { IdempotencyRepository } from '../src/shared/kernel/idempotency.js';
import { createTestApp } from './support/create-test-app.js';
import {
  FakeAuthKeyHasher,
  InMemoryAccountStore,
  InMemoryPowChallengeRepository,
  InMemorySessionRepository,
} from './support/identity-fakes.js';
import { solvePow } from './support/pow.js';
import { TEST_ALLOWED_ORIGIN } from './support/test-config.js';

const IDEMPOTENCY_KEY = '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0d';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const API_DATE = /^\d{4}-\d{2}-\d{2}$/;

function encoded(length: number, fill: number): string {
  return Buffer.alloc(length, fill).toString('base64url');
}

describe('POST /api/v1/auth/register (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let store: InMemoryAccountStore;

  function post(path: string, body: unknown): request.Test {
    return request(server)
      .post(`/api/v1/auth/${path}`)
      .set('Origin', TEST_ALLOWED_ORIGIN)
      .send(body as object);
  }

  async function solvedPow(): Promise<{ challengeId: string; nonce: string }> {
    const response = await post('pow', { purpose: 'register' }).expect(200);
    const { challengeId, prefix, difficulty } = response.body;
    return {
      challengeId,
      nonce: solvePow(Buffer.from(prefix, 'base64url'), difficulty),
    };
  }

  async function registerBody(
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return {
      login: 'kage',
      authKey: encoded(32, 1),
      kdf: {
        algorithm: 'argon2id13',
        salt: encoded(16, 2),
        opsLimit: 3,
        memLimitBytes: 67108864,
      },
      keys: {
        publicKey: encoded(32, 3),
        encryptedPrivateKey: {
          nonce: encoded(24, 4),
          ciphertext: encoded(48, 5),
        },
        recoveryEncryptedPrivateKey: {
          nonce: encoded(24, 6),
          ciphertext: encoded(48, 7),
        },
      },
      pow: await solvedPow(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    store = new InMemoryAccountStore();
    app = await createTestApp({
      rootModule: AppModule,
      overrides: [
        {
          provide: PowChallengeRepository,
          useValue: new InMemoryPowChallengeRepository(),
        },
        { provide: AccountRegistrar, useValue: store },
        { provide: AccountRepository, useValue: store },
        { provide: IdempotencyRepository, useValue: store },
        {
          provide: SessionRepository,
          useValue: new InMemorySessionRepository(),
        },
        { provide: AuthKeyHasher, useValue: new FakeAuthKeyHasher() },
      ],
    });
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates the account and answers in the contract format', async () => {
    const response = await post('register', await registerBody()).expect(201);

    expect(response.body).toEqual({
      account: {
        login: 'kage',
        createdAt: expect.stringMatching(API_DATE),
        settings: { ipBinding: true },
        limits: {
          maxActiveAliases: 20,
          activeAliases: 1,
          maxMessageBytes: 26214400,
        },
      },
      firstAlias: {
        id: expect.stringMatching(UUID),
        address: expect.stringMatching(/^[a-z0-9]{10}@shadowbox\.test$/),
        kind: 'permanent',
        status: 'active',
        encryptedLabel: null,
        folderId: null,
        expiresAt: null,
        createdAt: expect.stringMatching(API_DATE),
        lastReceivedAt: null,
      },
    });
  });

  it('sets a host-only, HttpOnly, Secure, SameSite=Strict session cookie', async () => {
    const response = await post('register', await registerBody()).expect(201);

    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/^__Host-sb_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('Domain');
  });

  it.each([
    [
      {
        kdf: {
          algorithm: 'argon2id13',
          salt: encoded(16, 2),
          opsLimit: 2,
          memLimitBytes: 67108864,
        },
      },
      'kdf.opsLimit',
      'invalid_value',
    ],
    [{ authKey: encoded(16, 1) }, 'authKey', 'too_short'],
    [{ authKey: encoded(33, 1) }, 'authKey', 'too_long'],
    [{ login: 'ab' }, 'login', 'too_short'],
    [{ extra: true }, 'extra', 'unknown_field'],
  ])('rejects %j', async (overrides, path, issue) => {
    const response = await post(
      'register',
      await registerBody(overrides),
    ).expect(400);

    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ path, issue }],
    });
  });

  it('rejects a reserved login', async () => {
    const response = await post(
      'register',
      await registerBody({ login: 'Postmaster' }),
    ).expect(422);

    expect(response.body.error.code).toBe('LOGIN_RESERVED');
  });

  it('rejects a taken login', async () => {
    await post('register', await registerBody()).expect(201);

    const response = await post(
      'register',
      await registerBody({ login: 'KAGE' }),
    ).expect(409);

    expect(response.body.error.code).toBe('LOGIN_TAKEN');
  });

  it('rejects a reused proof-of-work', async () => {
    const body = await registerBody();
    await post('register', body).expect(201);

    const response = await post('register', { ...body, login: 'other' }).expect(
      400,
    );

    expect(response.body.error.code).toBe('POW_INVALID');
  });

  describe('Idempotency-Key', () => {
    it('replays the original body with a new session cookie', async () => {
      const body = await registerBody();
      const first = await post('register', body)
        .set('Idempotency-Key', IDEMPOTENCY_KEY)
        .expect(201);

      const second = await post('register', body)
        .set('Idempotency-Key', IDEMPOTENCY_KEY)
        .expect(201);

      expect(second.body).toEqual(first.body);
      expect(second.headers['set-cookie']).not.toEqual(
        first.headers['set-cookie'],
      );
    });

    it('answers IDEMPOTENCY_CONFLICT for another body', async () => {
      const body = await registerBody();
      await post('register', body)
        .set('Idempotency-Key', IDEMPOTENCY_KEY)
        .expect(201);

      const response = await post('register', { ...body, login: 'other' })
        .set('Idempotency-Key', IDEMPOTENCY_KEY)
        .expect(409);

      expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('rejects a key that is not a UUID', async () => {
      const response = await post('register', await registerBody())
        .set('Idempotency-Key', 'retry-1')
        .expect(400);

      expect(response.body.error.details).toEqual([
        { path: 'Idempotency-Key', issue: 'invalid_format' },
      ]);
    });
  });

  it('requires an allowed Origin', async () => {
    const body = await registerBody();

    const response = await request(server)
      .post('/api/v1/auth/register')
      .send(body)
      .expect(403);

    expect(response.body.error.code).toBe('ORIGIN_MISMATCH');
  });
});

import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AccountRepository } from '../src/modules/identity/domain/account.repository.js';
import { AccountRegistrar } from '../src/modules/identity/domain/account-registrar.js';
import { AuthKeyHasher } from '../src/modules/identity/domain/auth-key-hasher.js';
import { PowChallengeRepository } from '../src/modules/identity/domain/pow-challenge.repository.js';
import { SessionRepository } from '../src/modules/identity/domain/session.repository.js';
import { AttemptCounter } from '../src/shared/kernel/attempt-counter.js';
import { IdempotencyRepository } from '../src/shared/kernel/idempotency.js';
import { createTestApp } from './support/create-test-app.js';
import {
  FakeAuthKeyHasher,
  InMemoryAccountStore,
  InMemoryPowChallengeRepository,
  InMemorySessionRepository,
  seedAccount,
} from './support/identity-fakes.js';
import { InMemoryAttemptCounter } from './support/kernel-fakes.js';
import { solvePow } from './support/pow.js';
import { TEST_ALLOWED_ORIGIN } from './support/test-config.js';

const AUTH_KEY = Buffer.alloc(32, 1).toString('base64url');
const WRONG_KEY = Buffer.alloc(32, 9).toString('base64url');
const API_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sessionCookieOf(response: request.Response): string {
  const header = String(response.headers['set-cookie'] ?? '');
  const match = /^(__Host-sb_session=[^;]*)/.exec(header);
  if (match?.[1] === undefined) {
    throw new Error(`No session cookie in ${header}`);
  }
  return match[1];
}

describe('Sessions (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let sessions: InMemorySessionRepository;

  function post(path: string, body: unknown, cookie?: string): request.Test {
    const test = request(server)
      .post(`/api/v1/auth/${path}`)
      .set('Origin', TEST_ALLOWED_ORIGIN);
    if (cookie !== undefined) {
      test.set('Cookie', cookie);
    }
    return test.send(body as object);
  }

  function getSession(cookie?: string): request.Test {
    const test = request(server).get('/api/v1/auth/session');
    return cookie === undefined ? test : test.set('Cookie', cookie);
  }

  async function signIn(): Promise<string> {
    const response = await post('login', {
      login: 'kage',
      authKey: AUTH_KEY,
    }).expect(200);
    return sessionCookieOf(response);
  }

  beforeEach(async () => {
    sessions = new InMemorySessionRepository();
    const store = new InMemoryAccountStore(undefined, sessions);
    await seedAccount(store, { login: 'kage', authKey: Buffer.alloc(32, 1) });
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
        { provide: SessionRepository, useValue: sessions },
        { provide: AuthKeyHasher, useValue: new FakeAuthKeyHasher() },
        { provide: AttemptCounter, useValue: new InMemoryAttemptCounter() },
      ],
    });
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/login', () => {
    it('signs in and returns the account with its keys', async () => {
      const response = await post('login', {
        login: 'Kage',
        authKey: AUTH_KEY,
      }).expect(200);

      expect(response.body).toEqual({
        account: expect.objectContaining({
          login: 'kage',
          settings: { ipBinding: true },
        }),
        keys: {
          publicKey: Buffer.alloc(32, 3).toString('base64url'),
          encryptedPrivateKey: {
            nonce: Buffer.alloc(24, 4).toString('base64url'),
            ciphertext: Buffer.alloc(48, 5).toString('base64url'),
          },
          kdf: {
            algorithm: 'argon2id13',
            salt: Buffer.alloc(16, 2).toString('base64url'),
            opsLimit: 3,
            memLimitBytes: 67108864,
          },
        },
      });
      expect(String(response.headers['set-cookie'])).toMatch(
        /^__Host-sb_session=[A-Za-z0-9_-]{43};.*HttpOnly; Secure; SameSite=Strict/,
      );
    });

    it('gives an unknown login and a wrong key the same answer', async () => {
      const wrongKey = await post('login', {
        login: 'kage',
        authKey: WRONG_KEY,
      }).expect(401);
      const unknown = await post('login', {
        login: 'nobody',
        authKey: AUTH_KEY,
      }).expect(401);

      expect(wrongKey.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.error).toEqual({
        ...wrongKey.body.error,
        requestId: unknown.body.error.requestId,
      });
    });

    it('asks for proof-of-work after five failures and then accepts it', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await post('login', { login: 'kage', authKey: WRONG_KEY }).expect(401);
      }

      const required = await post('login', {
        login: 'kage',
        authKey: AUTH_KEY,
      }).expect(428);
      const challenge = await post('pow', { purpose: 'login' }).expect(200);
      const nonce = solvePow(
        Buffer.from(challenge.body.prefix, 'base64url'),
        challenge.body.difficulty,
      );

      expect(required.body.error.code).toBe('POW_REQUIRED');
      await post('login', {
        login: 'kage',
        authKey: AUTH_KEY,
        pow: { challengeId: challenge.body.challengeId, nonce },
      }).expect(200);
    });

    it('locks the login with Retry-After after ten failures', async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const challenge = await post('pow', { purpose: 'login' }).expect(200);
        const nonce = solvePow(
          Buffer.from(challenge.body.prefix, 'base64url'),
          challenge.body.difficulty,
        );
        await post('login', {
          login: 'kage',
          authKey: WRONG_KEY,
          pow: { challengeId: challenge.body.challengeId, nonce },
        }).expect(401);
      }

      const locked = await post('login', {
        login: 'kage',
        authKey: AUTH_KEY,
      }).expect(423);

      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it.each([
      [{ login: 'kage' }, 'authKey', 'required'],
      [
        { login: 'kage', authKey: AUTH_KEY, remember: true },
        'remember',
        'unknown_field',
      ],
    ])('rejects %j', async (body, path, issue) => {
      const response = await post('login', body).expect(400);

      expect(response.body.error.details).toEqual([{ path, issue }]);
    });
  });

  describe('GET /api/v1/auth/session', () => {
    it('returns the account, keys and session of the cookie', async () => {
      const cookie = await signIn();

      const response = await getSession(cookie).expect(200);

      expect(response.body).toMatchObject({
        account: { login: 'kage' },
        keys: { publicKey: Buffer.alloc(32, 3).toString('base64url') },
        session: { id: expect.stringMatching(UUID), reauthUntil: null },
      });
    });

    it('answers 401 and clears the cookie without a live session', async () => {
      const response = await getSession(
        `__Host-sb_session=${Buffer.alloc(32, 7).toString('base64url')}`,
      ).expect(401);

      expect(response.body.error.code).toBe('UNAUTHENTICATED');
      expect(String(response.headers['set-cookie'])).toMatch(
        /^__Host-sb_session=;.*Expires=Thu, 01 Jan 1970/,
      );
    });

    it('answers 401 without a cookie', async () => {
      await getSession().expect(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('ends the session and clears the cookie', async () => {
      const cookie = await signIn();

      const response = await post('logout', {}, cookie).expect(204);

      expect(String(response.headers['set-cookie'])).toMatch(
        /^__Host-sb_session=;/,
      );
      await getSession(cookie).expect(401);
    });

    it('succeeds without a session', async () => {
      await post('logout', {}).expect(204);
    });

    it('still checks Origin', async () => {
      await request(server).post('/api/v1/auth/logout').expect(403);
    });
  });

  describe('POST /api/v1/auth/reauth', () => {
    it('opens the reauth window and replaces the cookie', async () => {
      const cookie = await signIn();

      const response = await post(
        'reauth',
        { authKey: AUTH_KEY },
        cookie,
      ).expect(204);
      const rotated = sessionCookieOf(response);

      expect(rotated).not.toBe(cookie);
      await getSession(cookie).expect(401);
      const state = await getSession(rotated).expect(200);
      expect(state.body.session.reauthUntil).toMatch(API_INSTANT);
    });

    it('refuses a wrong key and keeps the session', async () => {
      const cookie = await signIn();

      const response = await post(
        'reauth',
        { authKey: WRONG_KEY },
        cookie,
      ).expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.headers['set-cookie']).toBeUndefined();
      await getSession(cookie).expect(200);
    });

    it('requires a session', async () => {
      const response = await post('reauth', { authKey: AUTH_KEY }).expect(401);

      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });
  });
});

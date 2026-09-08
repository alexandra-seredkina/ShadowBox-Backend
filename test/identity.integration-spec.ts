import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { solvePow } from './support/pow.js';
import { TEST_ALLOWED_ORIGIN } from './support/test-config.js';
import { createTestPrisma, resetDatabase } from './support/test-database.js';

/**
 * The whole identity flow against PostgreSQL with the real Argon2id hasher,
 * counters and repositories: nothing is faked except the clock-free config.
 */
const LOOPBACK = ['127.0.0.1', '::ffff:127.0.0.1', '::1'];
const CLIENT_IP = '203.0.113.7';
const AUTH_KEY = Buffer.alloc(32, 1).toString('base64url');
const WRONG_KEY = Buffer.alloc(32, 9).toString('base64url');
const SALT = Buffer.alloc(16, 2).toString('base64url');

function encoded(length: number, fill: number): string {
  return Buffer.alloc(length, fill).toString('base64url');
}

function cookieOf(response: request.Response): string {
  const match = /^(__Host-sb_session=[^;]+)/.exec(
    String(response.headers['set-cookie'] ?? ''),
  );
  if (match?.[1] === undefined) {
    throw new Error('Response sets no session cookie');
  }
  return match[1];
}

describe('Identity (e2e on PostgreSQL)', () => {
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let server: App;

  function post(
    path: string,
    body: unknown,
    options: { cookie?: string; ip?: string } = {},
  ): request.Test {
    const test = request(server)
      .post(`/api/v1/auth/${path}`)
      .set('Origin', TEST_ALLOWED_ORIGIN)
      .set('X-Forwarded-For', options.ip ?? CLIENT_IP);
    if (options.cookie !== undefined) {
      test.set('Cookie', options.cookie);
    }
    return test.send(body as object);
  }

  function getSession(cookie: string, ip = CLIENT_IP): request.Test {
    return request(server)
      .get('/api/v1/auth/session')
      .set('X-Forwarded-For', ip)
      .set('Cookie', cookie);
  }

  async function solved(
    purpose: 'register' | 'login',
  ): Promise<{ challengeId: string; nonce: string }> {
    const response = await post('pow', { purpose }).expect(200);
    const { challengeId, prefix, difficulty } = response.body;
    return {
      challengeId,
      nonce: solvePow(Buffer.from(prefix, 'base64url'), difficulty),
    };
  }

  async function register(login: string): Promise<request.Response> {
    return post('register', {
      login,
      authKey: AUTH_KEY,
      kdf: {
        algorithm: 'argon2id13',
        salt: SALT,
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
      pow: await solved('register'),
    }).expect(201);
  }

  beforeEach(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    app = await createTestApp({
      rootModule: AppModule,
      prisma,
      config: { trustedProxies: LOOPBACK },
    });
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  it('walks through sign-up, unlock, sign-out, sign-in and reauth', async () => {
    const registered = await register('kage');
    const firstCookie = cookieOf(registered);
    expect(registered.body.firstAlias.address).toMatch(
      /^[a-z0-9]{10}@shadowbox\.test$/,
    );

    const unlocked = await getSession(firstCookie).expect(200);
    expect(unlocked.body.keys.kdf.salt).toBe(SALT);

    await post('logout', {}, { cookie: firstCookie }).expect(204);
    await getSession(firstCookie).expect(401);

    const prelogin = await post('prelogin', { login: 'KAGE' }).expect(200);
    expect(prelogin.body.kdf.salt).toBe(SALT);

    const signedIn = await post('login', {
      login: 'kage',
      authKey: AUTH_KEY,
    }).expect(200);
    expect(signedIn.body.account.limits.activeAliases).toBe(1);
    const cookie = cookieOf(signedIn);

    const reauth = await post(
      'reauth',
      { authKey: AUTH_KEY },
      { cookie },
    ).expect(204);
    const state = await getSession(cookieOf(reauth)).expect(200);
    expect(state.body.session.reauthUntil).not.toBeNull();
    await getSession(cookie).expect(401);
  });

  it('keeps no secret in a readable form', async () => {
    const registered = await register('kage');
    const token = cookieOf(registered).split('=')[1] ?? '';
    await post('login', { login: 'nobody', authKey: WRONG_KEY }).expect(401);

    const account = await prisma.account.findFirstOrThrow();
    const session = await prisma.session.findFirstOrThrow();
    const counters = await prisma.attemptCounter.findMany();
    expect(account.authKeyHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(account.authKeyHash).not.toContain(AUTH_KEY);
    expect(Buffer.from(session.tokenHash).toString('base64url')).not.toBe(
      token,
    );
    expect(Buffer.from(session.ipHash).toString('latin1')).not.toContain(
      CLIENT_IP,
    );
    expect(counters.length).toBeGreaterThan(0);
    for (const counter of counters) {
      expect(Buffer.from(counter.key).toString('latin1')).not.toMatch(
        /nobody|203\.0/,
      );
    }
  });

  it('cannot be used to tell existing logins from unknown ones', async () => {
    await register('kage');

    const timed = async (
      login: string,
    ): Promise<{ body: unknown; ms: number }> => {
      const started = performance.now();
      const response = await post(
        'login',
        { login, authKey: WRONG_KEY },
        { ip: `198.51.100.${login.length}` },
      ).expect(401);
      const { requestId: _, ...error } = response.body.error;
      return { body: error, ms: performance.now() - started };
    };
    const existing = [
      await timed('kage'),
      await timed('kage'),
      await timed('kage'),
    ];
    const unknown = [
      await timed('nobody'),
      await timed('nobody'),
      await timed('nobody'),
    ];

    expect(unknown[0]?.body).toEqual(existing[0]?.body);
    const median = (samples: { ms: number }[]): number =>
      samples.map((sample) => sample.ms).sort((a, b) => a - b)[1] ?? 0;
    const ratio = median(unknown) / median(existing);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });

  it('rejects invalid input before doing any work', async () => {
    const response = await post('register', { login: 'kage' }).expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    await expect(prisma.account.count()).resolves.toBe(0);
  });

  it('drops a bound session used from another address', async () => {
    const cookie = cookieOf(await register('kage'));

    await getSession(cookie, '198.51.100.1').expect(401);

    await getSession(cookie).expect(401);
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it('asks for proof-of-work after five failures, then locks the login', async () => {
    await register('kage');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post('login', { login: 'kage', authKey: WRONG_KEY }).expect(401);
    }
    await post('login', { login: 'kage', authKey: AUTH_KEY }).expect(428);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post(
        'login',
        { login: 'kage', authKey: WRONG_KEY, pow: await solved('login') },
        { ip: `198.51.100.${attempt}` },
      ).expect(401);
    }

    const locked = await post('login', {
      login: 'kage',
      authKey: AUTH_KEY,
      pow: await solved('login'),
    }).expect(423);

    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
  });
});

import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import {
  callAs,
  cookieOf,
  LOOPBACK_PROXIES,
  metadataBlob,
  registerUser,
  TEST_AUTH_KEY,
  TestUser,
} from './support/http-users.js';
import { createTestPrisma, resetDatabase } from './support/test-database.js';

describe('Account and sessions (e2e on PostgreSQL)', () => {
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let server: App;
  let kage: TestUser;
  let other: TestUser;

  function call(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    user: TestUser | null,
  ): request.Test {
    return callAs(server, method, path, user);
  }

  /** A second device of the same account, signed in from another address. */
  async function signInAgain(
    user: TestUser,
    login: string,
    ip: string,
  ): Promise<TestUser> {
    const response = await call('post', 'auth/login', {
      ...user,
      ip,
      cookie: '',
    })
      .send({ login, authKey: TEST_AUTH_KEY })
      .expect(200);
    return { ...user, ip, cookie: cookieOf(response) };
  }

  beforeEach(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
    app = await createTestApp({
      rootModule: AppModule,
      prisma,
      useDatabaseCounters: true,
      config: { trustedProxies: LOOPBACK_PROXIES },
    });
    server = app.getHttpServer();
    kage = await registerUser({
      server,
      prisma,
      login: 'kage',
      ip: '203.0.113.1',
    });
    other = await registerUser({
      server,
      prisma,
      login: 'other',
      ip: '203.0.113.2',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /account', () => {
    it('returns the account of the session', async () => {
      const response = await call('get', 'account', kage).expect(200);

      expect(response.body).toEqual({
        login: 'kage',
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        settings: { ipBinding: true },
        limits: {
          maxActiveAliases: 20,
          activeAliases: 1,
          maxMessageBytes: 26214400,
        },
      });
    });
  });

  describe('sessions', () => {
    it('lists the live sessions of the account with the current one marked', async () => {
      const laptop = await signInAgain(kage, 'kage', '203.0.113.11');

      const response = await call('get', 'sessions', laptop).expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(
        response.body.items.filter(
          (item: { isCurrent: boolean }) => item.isCurrent,
        ),
      ).toHaveLength(1);
      expect(response.body.items[0]).toEqual({
        id: expect.any(String),
        isCurrent: expect.any(Boolean),
        device: 'Other · Other',
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        lastActiveAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        isIpBound: true,
      });
    });

    it('ends another session of the account', async () => {
      const laptop = await signInAgain(kage, 'kage', '203.0.113.11');
      const listed = await call('get', 'sessions', kage).expect(200);
      const laptopId = listed.body.items.find(
        (item: { isCurrent: boolean }) => !item.isCurrent,
      ).id;

      const response = await call(
        'delete',
        `sessions/${laptopId}`,
        kage,
      ).expect(204);

      expect(response.headers['set-cookie']).toBeUndefined();
      await call('get', 'account', laptop).expect(401);
      await call('get', 'account', kage).expect(200);
    });

    it('signs out when ending the current session', async () => {
      const listed = await call('get', 'sessions', kage).expect(200);
      const currentId = listed.body.items[0].id;

      const response = await call(
        'delete',
        `sessions/${currentId}`,
        kage,
      ).expect(204);

      expect(String(response.headers['set-cookie'])).toMatch(
        /^__Host-sb_session=;/,
      );
      await call('get', 'account', kage).expect(401);
    });

    it('ends every other session at once', async () => {
      const laptop = await signInAgain(kage, 'kage', '203.0.113.11');
      const phone = await signInAgain(kage, 'kage', '203.0.113.12');

      await call('delete', 'sessions', kage).expect(204);

      await call('get', 'account', laptop).expect(401);
      await call('get', 'account', phone).expect(401);
      await call('get', 'account', kage).expect(200);
      await call('get', 'account', other).expect(200);
    });

    it('never touches the sessions of another account', async () => {
      const theirs = await call('get', 'sessions', other).expect(200);
      const theirId = theirs.body.items[0].id;

      const mine = await call('get', 'sessions', kage).expect(200);
      expect(
        mine.body.items.map((item: { id: string }) => item.id),
      ).not.toContain(theirId);
      await call('delete', `sessions/${theirId}`, kage).expect(404);
      await call('get', 'account', other).expect(200);
      await call('delete', 'sessions/not-a-uuid', kage).expect(404);
    });
  });

  describe('PATCH /account/settings', () => {
    it('unbinds every session and lets them move between addresses', async () => {
      const laptop = await signInAgain(kage, 'kage', '203.0.113.11');

      const response = await call('patch', 'account/settings', kage)
        .send({ ipBinding: false })
        .expect(200);

      expect(response.body.settings).toEqual({ ipBinding: false });
      await call('get', 'account', { ...laptop, ip: '198.51.100.7' }).expect(
        200,
      );
    });

    it('binds the current session to the address of the request', async () => {
      await call('patch', 'account/settings', kage)
        .send({ ipBinding: false })
        .expect(200);
      const moved = { ...kage, ip: '198.51.100.7' };

      await call('patch', 'account/settings', moved)
        .send({ ipBinding: true })
        .expect(200);

      await call('get', 'account', moved).expect(200);
      await call('get', 'account', kage).expect(401);
    });

    it('opens new sessions according to the setting', async () => {
      await call('patch', 'account/settings', kage)
        .send({ ipBinding: false })
        .expect(200);

      const laptop = await signInAgain(kage, 'kage', '203.0.113.11');

      await call('get', 'account', { ...laptop, ip: '198.51.100.8' }).expect(
        200,
      );
    });

    it.each([[{}], [{ ipBinding: 'no' }], [{ ipBinding: true, locale: 'ru' }]])(
      'rejects %j',
      async (body) => {
        await call('patch', 'account/settings', kage).send(body).expect(400);
      },
    );
  });

  describe('DELETE /account', () => {
    it('asks for reauth first', async () => {
      const response = await call('delete', 'account', kage).expect(403);

      expect(response.body.error.code).toBe('REAUTH_REQUIRED');
      await expect(
        prisma.account.count({ where: { login: 'kage' } }),
      ).resolves.toBe(1);
    });

    it('deletes everything of the account and revokes its addresses for good', async () => {
      await call('post', 'folders', kage)
        .send({ encryptedName: metadataBlob() })
        .expect(201);
      await call('post', 'aliases', kage)
        .send({
          kind: 'temporary',
          ttl: '7d',
          encryptedLabel: metadataBlob(),
          folderId: null,
        })
        .expect(201);
      const reauth = await call('post', 'auth/reauth', kage)
        .send({ authKey: TEST_AUTH_KEY })
        .expect(204);
      const cookie = cookieOf(reauth);

      const response = await call('delete', 'account', {
        ...kage,
        cookie,
      }).expect(204);

      expect(String(response.headers['set-cookie'])).toMatch(
        /^__Host-sb_session=;/,
      );
      await expect(
        prisma.account.count({ where: { login: 'kage' } }),
      ).resolves.toBe(0);
      const aliases = await prisma.alias.findMany({
        where: { accountId: null },
      });
      expect(aliases).toHaveLength(2);
      for (const alias of aliases) {
        expect(alias).toMatchObject({
          status: 'revoked',
          encryptedLabel: null,
          folderId: null,
        });
      }
      await call('get', 'account', { ...kage, cookie }).expect(401);
      await call('get', 'account', other).expect(200);
      await expect(prisma.folder.count()).resolves.toBe(3);
      await expect(prisma.session.count()).resolves.toBe(1);
    });

    it('lets nobody register the freed login to get the old addresses', async () => {
      const reauth = await call('post', 'auth/reauth', kage)
        .send({ authKey: TEST_AUTH_KEY })
        .expect(204);
      await call('delete', 'account', {
        ...kage,
        cookie: cookieOf(reauth),
      }).expect(204);

      const again = await registerUser({
        server,
        prisma,
        login: 'kage',
        ip: '203.0.113.3',
      });

      const aliases = await call('get', 'aliases', again).expect(200);
      expect(aliases.body.items).toHaveLength(1);
      await expect(prisma.alias.count()).resolves.toBe(3);
    });
  });
});

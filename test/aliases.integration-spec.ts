import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import {
  callAs,
  cookieOf,
  encoded,
  LOOPBACK_PROXIES,
  metadataBlob,
  registerUser,
  TEST_AUTH_KEY,
  TestUser,
} from './support/http-users.js';
import { createTestPrisma, resetDatabase } from './support/test-database.js';

const AUTH_KEY = TEST_AUTH_KEY;
const IDEMPOTENCY_KEY = '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0d';
const LABEL = metadataBlob();
type User = TestUser;

describe('Aliases (e2e on PostgreSQL)', () => {
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let server: App;
  let kage: User;
  let other: User;

  function call(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    user: User | null,
  ): request.Test {
    return callAs(server, method, path, user);
  }

  function register(login: string, ip: string): Promise<User> {
    return registerUser({ server, prisma, login, ip });
  }

  function createTemporary(
    user: User,
    body: Record<string, unknown> = {},
  ): request.Test {
    return call('post', 'aliases', user).send({
      kind: 'temporary',
      ttl: '24h',
      encryptedLabel: LABEL,
      folderId: null,
      ...body,
    });
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
    kage = await register('kage', '203.0.113.1');
    other = await register('other', '203.0.113.2');
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates, lists, updates and revokes an address', async () => {
    const created = await createTemporary(kage).expect(201);
    expect(created.body).toMatchObject({
      address: expect.stringMatching(/^[a-z0-9]{10}@shadowbox\.test$/),
      kind: 'temporary',
      status: 'active',
      encryptedLabel: LABEL,
      folderId: null,
      expiresAt: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
      ),
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      lastReceivedAt: null,
    });
    const id: string = created.body.id;

    const listed = await call('get', 'aliases', kage).expect(200);
    expect(
      listed.body.items.map((alias: { id: string }) => alias.id),
    ).toContain(id);
    expect(listed.body.items).toHaveLength(2);

    const disabled = await call('patch', `aliases/${id}`, kage)
      .send({ status: 'disabled', folderId: kage.inboxId })
      .expect(200);
    expect(disabled.body).toMatchObject({
      status: 'disabled',
      folderId: kage.inboxId,
      encryptedLabel: LABEL,
    });
    const filtered = await call('get', 'aliases?status=disabled', kage).expect(
      200,
    );
    expect(
      filtered.body.items.map((alias: { id: string }) => alias.id),
    ).toEqual([id]);

    await call('delete', `aliases/${id}`, kage).expect(204);
    await call('patch', `aliases/${id}`, kage).send({}).expect(404);
  });

  it('keeps accounts apart', async () => {
    const created = await createTemporary(kage).expect(201);
    const id: string = created.body.id;

    const theirs = await call('get', 'aliases', other).expect(200);
    expect(
      theirs.body.items.map((alias: { id: string }) => alias.id),
    ).not.toContain(id);
    await call('patch', `aliases/${id}`, other)
      .send({ status: 'disabled' })
      .expect(404);
    await call('delete', `aliases/${id}`, other).expect(404);
    await createTemporary(other, { folderId: kage.inboxId }).expect(404);
    await call('patch', `aliases/${id}`, kage)
      .send({ folderId: other.inboxId })
      .expect(404);

    const untouched = await prisma.alias.findUniqueOrThrow({ where: { id } });
    expect(untouched.status).toBe('active');
  });

  it('asks for reauth before revoking a permanent address', async () => {
    const listed = await call('get', 'aliases', kage).expect(200);
    const firstAlias: string = listed.body.items[0].id;

    const refused = await call('delete', `aliases/${firstAlias}`, kage).expect(
      403,
    );
    expect(refused.body.error.code).toBe('REAUTH_REQUIRED');

    const reauth = await call('post', 'auth/reauth', kage)
      .send({ authKey: AUTH_KEY })
      .expect(204);
    await call('delete', `aliases/${firstAlias}`, {
      ...kage,
      cookie: cookieOf(reauth),
    }).expect(204);
  });

  it('replays a creation with the same Idempotency-Key', async () => {
    const first = await createTemporary(kage)
      .set('Idempotency-Key', IDEMPOTENCY_KEY)
      .expect(201);
    const second = await createTemporary(kage)
      .set('Idempotency-Key', IDEMPOTENCY_KEY)
      .expect(201);
    const conflict = await createTemporary(kage, { ttl: '7d' })
      .set('Idempotency-Key', IDEMPOTENCY_KEY)
      .expect(409);

    expect(second.body).toEqual(first.body);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    await expect(prisma.alias.count()).resolves.toBe(3);
  });

  it('stops at twenty active addresses and reports it in the account', async () => {
    for (let index = 1; index < 20; index += 1) {
      await createTemporary(kage).expect(201);
    }

    const refused = await createTemporary(kage).expect(422);
    const session = await call('get', 'auth/session', kage).expect(200);

    expect(refused.body.error.code).toBe('ALIAS_LIMIT_EXCEEDED');
    expect(session.body.account.limits).toMatchObject({
      activeAliases: 20,
      maxActiveAliases: 20,
    });
  });

  it.each([
    [
      { kind: 'permanent', ttl: '7d', encryptedLabel: null, folderId: null },
      'ttl',
      'unknown_field',
    ],
    [
      { kind: 'temporary', encryptedLabel: null, folderId: null },
      'ttl',
      'required',
    ],
    [
      { kind: 'temporary', ttl: '2d', encryptedLabel: null, folderId: null },
      'ttl',
      'invalid_value',
    ],
    [
      {
        kind: 'temporary',
        ttl: '1h',
        encryptedLabel: { ...LABEL, ciphertext: encoded(2000, 1) },
        folderId: null,
      },
      'encryptedLabel.ciphertext',
      'too_long',
    ],
    [
      { kind: 'temporary', ttl: '1h', encryptedLabel: null },
      'folderId',
      'required',
    ],
  ])('rejects %j', async (body, path, issue) => {
    const response = await call('post', 'aliases', kage).send(body).expect(400);

    expect(response.body.error.details).toContainEqual({ path, issue });
  });

  it('answers NOT_FOUND for a malformed id and 401 without a session', async () => {
    await call('patch', 'aliases/not-a-uuid', kage).send({}).expect(404);
    await call('get', 'aliases', null).expect(401);
  });
});

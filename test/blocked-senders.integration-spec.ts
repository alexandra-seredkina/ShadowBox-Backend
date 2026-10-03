import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import {
  callAs,
  LOOPBACK_PROXIES,
  metadataBlob,
  registerUser,
  TestUser,
} from './support/http-users.js';
import { createTestPrisma, resetDatabase } from './support/test-database.js';

const ADDRESS = 'Spam@Annoying.example';

describe('Blocked senders (e2e on PostgreSQL)', () => {
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

  function block(
    user: TestUser | null,
    address = ADDRESS,
    fill = 3,
  ): request.Test {
    return call('post', 'blocked-senders', user).send({
      address,
      encryptedAddress: metadataBlob(fill),
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

  it('blocks a sender once and lists it newest first', async () => {
    const created = await block(kage).expect(201);
    const again = await block(kage, 'spam@annoying.example', 9).expect(200);
    const second = await block(kage, 'other@annoying.example').expect(201);

    const listed = await call('get', 'blocked-senders', kage).expect(200);

    expect(created.body).toEqual({
      id: expect.any(String),
      encryptedAddress: metadataBlob(3),
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(again.body).toEqual(created.body);
    expect(listed.body.items.map((item: { id: string }) => item.id)).toEqual([
      second.body.id,
      created.body.id,
    ]);
  });

  it('keeps only a keyed hash of the address', async () => {
    await block(kage).expect(201);

    const rows = await prisma.blockedSender.findMany();
    const dump = JSON.stringify(rows, (_key, value: unknown) =>
      value instanceof Uint8Array
        ? Buffer.from(value).toString('latin1')
        : value,
    );

    expect(rows[0]?.senderHash).toHaveLength(32);
    expect(dump.toLowerCase()).not.toContain('annoying');
  });

  it('keeps lists apart per account', async () => {
    await block(kage).expect(201);
    await block(other).expect(201);

    const listed = await call('get', 'blocked-senders', other).expect(200);

    expect(listed.body.items).toHaveLength(1);
    await expect(prisma.blockedSender.count()).resolves.toBe(2);
  });

  it("unblocks own entries and answers someone else's with 404", async () => {
    const own = await block(kage).expect(201);
    const foreign = await block(other).expect(201);

    await call('delete', `blocked-senders/${foreign.body.id}`, kage).expect(
      404,
    );
    await call('delete', 'blocked-senders/nope', kage).expect(404);
    await call('delete', `blocked-senders/${own.body.id}`, kage).expect(204);

    await expect(prisma.blockedSender.count()).resolves.toBe(1);
  });

  it('validates the address and the sealed copy', async () => {
    const response = await call('post', 'blocked-senders', kage)
      .send({ address: 'not an address', encryptedAddress: null })
      .expect(400);

    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        { path: 'address', issue: 'invalid_format' },
        { path: 'encryptedAddress', issue: 'invalid_type' },
      ]),
    );
  });

  it('needs a session', async () => {
    await call('get', 'blocked-senders', null).expect(401);
    await block(null).expect(401);
  });
});

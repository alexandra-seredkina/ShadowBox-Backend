import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import {
  callAs,
  encoded,
  LOOPBACK_PROXIES,
  metadataBlob,
  registerUser,
  TestUser,
} from './support/http-users.js';
import { createTestPrisma, resetDatabase } from './support/test-database.js';

describe('Folders (e2e on PostgreSQL)', () => {
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

  async function createFolder(user: TestUser, fill = 3): Promise<string> {
    const response = await call('post', 'folders', user)
      .send({ encryptedName: metadataBlob(fill) })
      .expect(201);
    return response.body.id;
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

  it('lists the system folders created at sign-up', async () => {
    const response = await call('get', 'folders', kage).expect(200);

    expect(response.body.items).toEqual([
      {
        id: kage.inboxId,
        kind: 'system',
        systemRole: 'inbox',
        encryptedName: null,
        unreadCount: 0,
      },
      expect.objectContaining({
        kind: 'system',
        systemRole: 'spam',
        encryptedName: null,
      }),
      expect.objectContaining({
        kind: 'system',
        systemRole: 'trash',
        encryptedName: null,
      }),
    ]);
  });

  it('creates, renames and deletes a custom folder', async () => {
    const id = await createFolder(kage);

    const renamed = await call('patch', `folders/${id}`, kage)
      .send({ encryptedName: metadataBlob(9) })
      .expect(200);
    expect(renamed.body).toEqual({
      id,
      kind: 'custom',
      systemRole: null,
      encryptedName: metadataBlob(9),
      unreadCount: 0,
    });

    await call('delete', `folders/${id}`, kage).expect(204);
    const listed = await call('get', 'folders', kage).expect(200);
    expect(listed.body.items).toHaveLength(3);
  });

  it('unpins addresses from a deleted folder', async () => {
    const id = await createFolder(kage);
    const alias = await call('post', 'aliases', kage)
      .send({
        kind: 'temporary',
        ttl: '1h',
        encryptedLabel: null,
        folderId: id,
      })
      .expect(201);

    await call('delete', `folders/${id}`, kage).expect(204);

    const aliases = await call('get', 'aliases', kage).expect(200);
    const pinned = aliases.body.items.find(
      (item: { id: string }) => item.id === alias.body.id,
    );
    expect(pinned.folderId).toBeNull();
  });

  it('keeps accounts apart', async () => {
    const id = await createFolder(kage);

    const theirs = await call('get', 'folders', other).expect(200);
    expect(
      theirs.body.items.map((folder: { id: string }) => folder.id),
    ).not.toContain(id);
    await call('patch', `folders/${id}`, other)
      .send({ encryptedName: metadataBlob() })
      .expect(404);
    await call('delete', `folders/${id}`, other).expect(404);
    await call('delete', `folders/${kage.inboxId}`, other).expect(404);
    await expect(prisma.folder.count({ where: { id } })).resolves.toBe(1);
  });

  it('refuses to rename or delete a system folder', async () => {
    const renamed = await call('patch', `folders/${kage.inboxId}`, kage)
      .send({ encryptedName: metadataBlob() })
      .expect(422);
    const deleted = await call(
      'delete',
      `folders/${kage.inboxId}`,
      kage,
    ).expect(422);

    expect(renamed.body.error.code).toBe('FOLDER_IS_SYSTEM');
    expect(deleted.body.error.code).toBe('FOLDER_IS_SYSTEM');
  });

  it('stops at fifty custom folders', async () => {
    for (let index = 0; index < 50; index += 1) {
      await createFolder(kage);
    }

    const refused = await call('post', 'folders', kage)
      .send({ encryptedName: metadataBlob() })
      .expect(422);

    expect(refused.body.error.code).toBe('FOLDER_LIMIT_EXCEEDED');
  });

  it.each([
    [{}, 'encryptedName', 'required'],
    [{ encryptedName: null }, 'encryptedName', 'invalid_type'],
    [
      { encryptedName: { ...metadataBlob(), nonce: encoded(12, 1) } },
      'encryptedName.nonce',
      'too_short',
    ],
  ])('rejects %j', async (body, path, issue) => {
    const response = await call('post', 'folders', kage).send(body).expect(400);

    expect(response.body.error.details).toContainEqual({ path, issue });
  });

  it('answers NOT_FOUND for a malformed id and 401 without a session', async () => {
    await call('delete', 'folders/not-a-uuid', kage).expect(404);
    await call('get', 'folders', null).expect(401);
  });
});

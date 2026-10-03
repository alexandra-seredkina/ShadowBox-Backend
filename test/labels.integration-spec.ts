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

const MISSING_ID = '0192f0a0-0000-7000-8000-00000000dead';
const PREVIEW = {
  v: 1,
  alg: 'x25519-xchacha20poly1305',
  sealedKey: Buffer.alloc(80, 1).toString('base64url'),
  nonce: Buffer.alloc(24, 2).toString('base64url'),
  ciphertext: Buffer.alloc(40, 3).toString('base64url'),
};

describe('Labels (e2e on PostgreSQL)', () => {
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

  async function createLabel(user: TestUser, fill = 3): Promise<string> {
    const response = await call('post', 'labels', user)
      .send({ encryptedName: metadataBlob(fill) })
      .expect(201);
    return response.body.id;
  }

  async function accountOf(user: TestUser): Promise<string> {
    const inbox = await prisma.folder.findUniqueOrThrow({
      where: { id: user.inboxId },
      select: { accountId: true },
    });
    return inbox.accountId;
  }

  async function deliver(
    user: TestUser,
    minute: number,
    folderId = user.inboxId,
  ): Promise<string> {
    const row = await prisma.message.create({
      data: {
        accountId: await accountOf(user),
        folderId,
        receivedAt: new Date(Date.UTC(2020, 0, 15, 12, minute)),
        sizeBytes: 1024,
        threatVerdict: 'safe',
        spfResult: 'pass',
        dkimResult: 'pass',
        dmarcResult: 'pass',
        encryptedPreview: PREVIEW,
        bodyBlobVersion: 1,
        bodySealedKey: new Uint8Array(80),
        bodyNonce: new Uint8Array(24),
        bodyCiphertext: new Uint8Array(32),
      },
      select: { id: true },
    });
    return row.id;
  }

  async function trashOf(user: TestUser): Promise<string> {
    const trash = await prisma.folder.findFirstOrThrow({
      where: { accountId: await accountOf(user), systemRole: 'trash' },
    });
    return trash.id;
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

  it('creates, lists, renames and deletes labels', async () => {
    const first = await createLabel(kage, 3);
    const second = await createLabel(kage, 4);

    const renamed = await call('patch', `labels/${first}`, kage)
      .send({ encryptedName: metadataBlob(9) })
      .expect(200);
    await call('delete', `labels/${second}`, kage).expect(204);
    const listed = await call('get', 'labels', kage).expect(200);

    expect(renamed.body).toEqual({
      id: first,
      encryptedName: metadataBlob(9),
      unreadCount: 0,
    });
    expect(listed.body).toEqual({
      items: [{ id: first, encryptedName: metadataBlob(9), unreadCount: 0 }],
    });
  });

  it('stops at fifty labels', async () => {
    for (let i = 0; i < 50; i += 1) {
      await createLabel(kage);
    }

    const response = await call('post', 'labels', kage)
      .send({ encryptedName: metadataBlob() })
      .expect(422);

    expect(response.body.error.code).toBe('LABEL_LIMIT_EXCEEDED');
  });

  it("answers someone else's label like a missing one", async () => {
    const foreign = await createLabel(other);

    for (const id of [foreign, MISSING_ID, 'nope']) {
      await call('patch', `labels/${id}`, kage)
        .send({ encryptedName: metadataBlob() })
        .expect(404);
      await call('delete', `labels/${id}`, kage).expect(404);
      await call('get', `messages?labelId=${id}`, kage).expect(404);
    }
    await expect(prisma.label.count()).resolves.toBe(1);
  });

  it('labels messages one by one and in batches, and lists them by label', async () => {
    const work = await createLabel(kage, 3);
    const home = await createLabel(kage, 4);
    const first = await deliver(kage, 1);
    const second = await deliver(kage, 2);
    const third = await deliver(kage, 3);
    const foreign = await deliver(other, 4);

    const patched = await call('patch', `messages/${first}`, kage)
      .send({ labelIds: [home, work] })
      .expect(200);
    const batch = await call('post', 'messages/batch', kage)
      .send({ ids: [second, third, foreign], action: 'label', labelId: work })
      .expect(200);
    await call('post', 'messages/batch', kage)
      .send({ ids: [third], action: 'unlabel', labelId: work })
      .expect(200);
    const listed = await call('get', `messages?labelId=${work}`, kage).expect(
      200,
    );

    expect(patched.body.labelIds).toEqual([work, home]);
    expect(batch.body).toEqual({ processed: 2 });
    expect(listed.body.items.map((item: { id: string }) => item.id)).toEqual([
      second,
      first,
    ]);
    await expect(
      prisma.messageLabel.count({ where: { messageId: foreign } }),
    ).resolves.toBe(0);
  });

  it('counts unread labelled mail outside the trash', async () => {
    const label = await createLabel(kage);
    const unread = await deliver(kage, 1);
    const read = await deliver(kage, 2);
    const trashed = await deliver(kage, 3, await trashOf(kage));
    await call('post', 'messages/batch', kage)
      .send({ ids: [unread, read, trashed], action: 'label', labelId: label })
      .expect(200);
    await call('patch', `messages/${read}`, kage)
      .send({ isRead: true })
      .expect(200);

    const listed = await call('get', 'labels', kage).expect(200);
    const inLabel = await call('get', `messages?labelId=${label}`, kage).expect(
      200,
    );

    expect(listed.body.items[0].unreadCount).toBe(1);
    expect(inLabel.body.items).toHaveLength(2);
  });

  it("refuses someone else's label on a message and changes nothing", async () => {
    const own = await createLabel(kage);
    const foreign = await createLabel(other);
    const id = await deliver(kage, 1);
    await call('patch', `messages/${id}`, kage)
      .send({ labelIds: [own] })
      .expect(200);

    await call('patch', `messages/${id}`, kage)
      .send({ labelIds: [foreign] })
      .expect(404);
    await call('post', 'messages/batch', kage)
      .send({ ids: [id], action: 'label', labelId: foreign })
      .expect(404);
    const duplicate = await call('patch', `messages/${id}`, kage)
      .send({ labelIds: [own, own] })
      .expect(400);

    const message = await call('get', `messages/${id}`, kage).expect(200);
    expect(message.body.labelIds).toEqual([own]);
    expect(duplicate.body.error.details[0].path).toBe('labelIds');
  });

  it('gives addresses labels for their new mail', async () => {
    const label = await createLabel(kage);
    const foreign = await createLabel(other);
    const created = await call('post', 'aliases', kage)
      .send({
        kind: 'permanent',
        encryptedLabel: null,
        folderId: null,
        labelIds: [label],
      })
      .expect(201);

    await call('patch', `aliases/${created.body.id}`, kage)
      .send({ labelIds: [foreign] })
      .expect(404);
    const listed = await call('get', 'aliases', kage).expect(200);

    expect(created.body.labelIds).toEqual([label]);
    expect(
      listed.body.items.map((alias: { labelIds: string[] }) => alias.labelIds),
    ).toContainEqual([label]);
  });

  it('takes a deleted label off messages and addresses but keeps them', async () => {
    const label = await createLabel(kage);
    const id = await deliver(kage, 1);
    await call('patch', `messages/${id}`, kage)
      .send({ labelIds: [label] })
      .expect(200);
    const alias = await call('post', 'aliases', kage)
      .send({
        kind: 'permanent',
        encryptedLabel: null,
        folderId: null,
        labelIds: [label],
      })
      .expect(201);

    await call('delete', `labels/${label}`, kage).expect(204);

    const message = await call('get', `messages/${id}`, kage).expect(200);
    const aliases = await call('get', 'aliases', kage).expect(200);
    expect(message.body.labelIds).toEqual([]);
    expect(
      aliases.body.items.find(
        (item: { id: string }) => item.id === alias.body.id,
      ).labelIds,
    ).toEqual([]);
  });
});

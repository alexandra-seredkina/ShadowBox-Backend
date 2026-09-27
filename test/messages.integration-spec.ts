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
  ciphertext: Buffer.alloc(300, 3).toString('base64url'),
};

describe('Messages (e2e on PostgreSQL)', () => {
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

  async function folderOf(
    user: TestUser,
    role: 'spam' | 'trash',
  ): Promise<string> {
    const folder = await prisma.folder.findFirstOrThrow({
      where: {
        account: { folders: { some: { id: user.inboxId } } },
        systemRole: role,
      },
      select: { id: true },
    });
    return folder.id;
  }

  /** Stores a message the way delivery does; minute n after noon. */
  async function deliver(
    user: TestUser,
    minute: number,
    fields: { folderId?: string; isRead?: boolean } = {},
  ): Promise<string> {
    const inbox = await prisma.folder.findUniqueOrThrow({
      where: { id: user.inboxId },
      select: { accountId: true },
    });
    const row = await prisma.message.create({
      data: {
        accountId: inbox.accountId,
        folderId: fields.folderId ?? user.inboxId,
        receivedAt: new Date(Date.UTC(2020, 0, 15, 12, minute, 0, 123)),
        isRead: fields.isRead ?? false,
        sizeBytes: 2048,
        threatVerdict: 'caution',
        threatMarkers: ['UNKNOWN_SENDER'],
        spfResult: 'pass',
        dkimResult: 'none',
        dmarcResult: 'pass',
        encryptedPreview: PREVIEW,
        bodyBlobVersion: 1,
        bodySealedKey: new Uint8Array(80).fill(4),
        bodyNonce: new Uint8Array(24).fill(5),
        bodyCiphertext: new Uint8Array(1500).fill(6),
      },
      select: { id: true },
    });
    return row.id;
  }

  async function unreadIn(user: TestUser, folderId: string): Promise<number> {
    const response = await call('get', 'folders', user).expect(200);
    const folders: Array<{ id: string; unreadCount: number }> =
      response.body.items;
    return folders.find((folder) => folder.id === folderId)?.unreadCount ?? -1;
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

  describe('GET /messages', () => {
    it('lists a folder newest first with the summary fields', async () => {
      const older = await deliver(kage, 1);
      const newer = await deliver(kage, 2);

      const response = await call(
        'get',
        `messages?folderId=${kage.inboxId}`,
        kage,
      ).expect(200);

      expect(response.body).toEqual({
        items: [
          expect.objectContaining({ id: newer }),
          {
            id: older,
            folderId: kage.inboxId,
            aliasId: null,
            receivedAt: '2020-01-15T12:01:00Z',
            isRead: false,
            sizeBytes: 2048,
            threat: {
              verdict: 'caution',
              markers: ['UNKNOWN_SENDER'],
              auth: { spf: 'pass', dkim: 'none', dmarc: 'pass' },
            },
            encryptedPreview: PREVIEW,
          },
        ],
        nextCursor: null,
      });
    });

    it('walks every page with the cursor', async () => {
      const ids = [];
      for (let minute = 1; minute <= 5; minute += 1) {
        ids.push(await deliver(kage, minute));
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string =
          `messages?folderId=${kage.inboxId}&limit=2` +
          (cursor === null ? '' : `&cursor=${cursor}`);
        const response = await call('get', query, kage).expect(200);
        seen.push(
          ...response.body.items.map((item: { id: string }) => item.id),
        );
        cursor = response.body.nextCursor;
      } while (cursor !== null);

      expect(seen).toEqual(ids.toReversed());
    });

    it('keeps the order for messages received in the same millisecond', async () => {
      const ids = [
        await deliver(kage, 1),
        await deliver(kage, 1),
        await deliver(kage, 1),
      ];

      const first = await call(
        'get',
        `messages?folderId=${kage.inboxId}&limit=2`,
        kage,
      ).expect(200);
      const second = await call(
        'get',
        `messages?folderId=${kage.inboxId}&limit=2&cursor=${first.body.nextCursor}`,
        kage,
      ).expect(200);

      expect(
        [...first.body.items, ...second.body.items].map(
          (item: { id: string }) => item.id,
        ),
      ).toEqual(ids.toSorted().toReversed());
    });

    it('validates folderId, limit and cursor', async () => {
      const spam = await folderOf(kage, 'spam');
      await deliver(kage, 1);
      await deliver(kage, 2);
      const first = await call(
        'get',
        `messages?folderId=${kage.inboxId}&limit=1`,
        kage,
      ).expect(200);

      const missing = await call('get', 'messages', kage).expect(400);
      const tooBig = await call(
        'get',
        `messages?folderId=${kage.inboxId}&limit=101`,
        kage,
      ).expect(400);
      const zero = await call(
        'get',
        `messages?folderId=${kage.inboxId}&limit=0`,
        kage,
      ).expect(400);
      const garbage = await call(
        'get',
        `messages?folderId=${kage.inboxId}&cursor=nope`,
        kage,
      ).expect(400);
      const elsewhere = await call(
        'get',
        `messages?folderId=${spam}&cursor=${first.body.nextCursor}`,
        kage,
      ).expect(400);
      const unknown = await call(
        'get',
        `messages?folderId=${kage.inboxId}&sort=asc`,
        kage,
      ).expect(400);

      expect(missing.body.error.details).toEqual([
        { path: 'folderId', issue: 'required' },
      ]);
      expect(tooBig.body.error.details[0].path).toBe('limit');
      expect(zero.body.error.details[0].path).toBe('limit');
      expect(garbage.body.error.details[0].path).toBe('cursor');
      expect(elsewhere.body.error.details[0].path).toBe('cursor');
      expect(unknown.body.error.details).toEqual([
        { path: 'sort', issue: 'unknown_field' },
      ]);
    });

    it("answers someone else's folder like a missing one", async () => {
      await deliver(other, 1);

      for (const folderId of [other.inboxId, MISSING_ID, 'not-a-uuid']) {
        const response = await call(
          'get',
          `messages?folderId=${folderId}`,
          kage,
        ).expect(404);
        expect(response.body.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('GET /messages/{id} and /content', () => {
    it('returns the summary and the sealed body', async () => {
      const id = await deliver(kage, 1);

      const summary = await call('get', `messages/${id}`, kage).expect(200);
      const content = await call('get', `messages/${id}/content`, kage).expect(
        200,
      );

      expect(summary.body).toMatchObject({ id, isRead: false });
      expect(content.body).toEqual({
        body: {
          v: 1,
          alg: 'x25519-xchacha20poly1305',
          sealedKey: Buffer.alloc(80, 4).toString('base64url'),
          nonce: Buffer.alloc(24, 5).toString('base64url'),
          ciphertext: Buffer.alloc(1500, 6).toString('base64url'),
        },
      });
    });

    it('does not mark the message read', async () => {
      const id = await deliver(kage, 1);

      await call('get', `messages/${id}/content`, kage).expect(200);

      expect(await unreadIn(kage, kage.inboxId)).toBe(1);
    });
  });

  describe('PATCH /messages/{id}', () => {
    it('marks read, moves to the trash and updates unread counts', async () => {
      const id = await deliver(kage, 1);
      const trash = await folderOf(kage, 'trash');

      await call('patch', `messages/${id}`, kage)
        .send({ isRead: true })
        .expect(200);
      expect(await unreadIn(kage, kage.inboxId)).toBe(0);

      const moved = await call('patch', `messages/${id}`, kage)
        .send({ isRead: false, folderId: trash })
        .expect(200);

      expect(moved.body).toMatchObject({ folderId: trash, isRead: false });
      expect(await unreadIn(kage, trash)).toBe(1);
    });

    it('accepts an empty change', async () => {
      const id = await deliver(kage, 1);

      await call('patch', `messages/${id}`, kage).send({}).expect(200);
    });

    it("refuses someone else's folder and leaves the message alone", async () => {
      const id = await deliver(kage, 1);

      await call('patch', `messages/${id}`, kage)
        .send({ folderId: other.inboxId })
        .expect(404);

      const row = await prisma.message.findUniqueOrThrow({ where: { id } });
      expect(row.folderId).toBe(kage.inboxId);
    });

    it('validates the body', async () => {
      const id = await deliver(kage, 1);

      const response = await call('patch', `messages/${id}`, kage)
        .send({ isRead: 'yes', subject: 'x' })
        .expect(400);

      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          { path: 'isRead', issue: 'invalid_type' },
          { path: 'subject', issue: 'unknown_field' },
        ]),
      );
    });
  });

  describe('POST /messages/batch', () => {
    it('applies an action to own messages and skips the rest', async () => {
      const own = [await deliver(kage, 1), await deliver(kage, 2)];
      const foreign = await deliver(other, 1);

      const response = await call('post', 'messages/batch', kage)
        .send({
          ids: [...own, own[0], foreign, MISSING_ID],
          action: 'markRead',
        })
        .expect(200);

      expect(response.body).toEqual({ processed: 2 });
      expect(await unreadIn(kage, kage.inboxId)).toBe(0);
      expect(await unreadIn(other, other.inboxId)).toBe(1);
    });

    it('moves and deletes', async () => {
      const ids = [await deliver(kage, 1), await deliver(kage, 2)];
      const spam = await folderOf(kage, 'spam');

      await call('post', 'messages/batch', kage)
        .send({ ids, action: 'move', folderId: spam })
        .expect(200);
      expect(await prisma.message.count({ where: { folderId: spam } })).toBe(2);

      await call('post', 'messages/batch', kage)
        .send({ ids, action: 'delete' })
        .expect(200);
      expect(await prisma.message.count()).toBe(0);
    });

    it("refuses a move into someone else's folder and changes nothing", async () => {
      const id = await deliver(kage, 1);

      await call('post', 'messages/batch', kage)
        .send({ ids: [id], action: 'move', folderId: other.inboxId })
        .expect(404);

      const row = await prisma.message.findUniqueOrThrow({ where: { id } });
      expect(row.folderId).toBe(kage.inboxId);
    });

    it('validates ids and the action', async () => {
      const empty = await call('post', 'messages/batch', kage)
        .send({ ids: [], action: 'delete' })
        .expect(400);
      const tooMany = await call('post', 'messages/batch', kage)
        .send({
          ids: Array.from({ length: 101 }, () => MISSING_ID),
          action: 'delete',
        })
        .expect(400);
      const malformed = await call('post', 'messages/batch', kage)
        .send({ ids: ['nope'], action: 'delete' })
        .expect(400);
      const moveWithoutFolder = await call('post', 'messages/batch', kage)
        .send({ ids: [MISSING_ID], action: 'move' })
        .expect(400);
      const folderWithoutMove = await call('post', 'messages/batch', kage)
        .send({ ids: [MISSING_ID], action: 'delete', folderId: kage.inboxId })
        .expect(400);

      expect(empty.body.error.details[0].path).toBe('ids');
      expect(tooMany.body.error.details[0].path).toBe('ids');
      expect(malformed.body.error.details).toEqual([
        { path: 'ids.0', issue: 'invalid_format' },
      ]);
      expect(moveWithoutFolder.body.error.details).toEqual([
        { path: 'folderId', issue: 'required' },
      ]);
      expect(folderWithoutMove.body.error.details).toEqual([
        { path: 'folderId', issue: 'unknown_field' },
      ]);
    });
  });

  describe('DELETE /messages/{id}', () => {
    it('deletes the message for good from any folder', async () => {
      const id = await deliver(kage, 1, {
        folderId: await folderOf(kage, 'spam'),
      });

      await call('delete', `messages/${id}`, kage).expect(204);

      expect(await prisma.message.count()).toBe(0);
    });
  });

  describe('ownership', () => {
    it("answers every request for someone else's message with 404", async () => {
      const id = await deliver(other, 1);
      const requests = [
        () => call('get', `messages/${id}`, kage),
        () => call('get', `messages/${id}/content`, kage),
        () => call('patch', `messages/${id}`, kage).send({ isRead: true }),
        () => call('delete', `messages/${id}`, kage),
      ];

      for (const send of requests) {
        const response = await send().expect(404);
        expect(response.body.error.code).toBe('NOT_FOUND');
      }
      const row = await prisma.message.findUniqueOrThrow({ where: { id } });
      expect(row.isRead).toBe(false);
    });

    it('answers missing and malformed ids with 404', async () => {
      for (const id of [MISSING_ID, 'not-a-uuid']) {
        await call('get', `messages/${id}`, kage).expect(404);
      }
    });

    it('needs a session', async () => {
      const id = await deliver(kage, 1);

      await call('get', `messages?folderId=${kage.inboxId}`, null).expect(401);
      await call('get', `messages/${id}`, null).expect(401);
      await call('post', 'messages/batch', null)
        .send({ ids: [id], action: 'delete' })
        .expect(401);
      expect(await prisma.message.count()).toBe(1);
    });

    it('checks the origin of changes', async () => {
      const id = await deliver(kage, 1);

      await request(server)
        .delete(`/api/v1/messages/${id}`)
        .set('Origin', 'https://evil.example')
        .set('X-Forwarded-For', kage.ip)
        .set('Cookie', kage.cookie)
        .expect(403);
    });
  });

  it('keeps folder deletion moving mail to the inbox', async () => {
    const folder = await call('post', 'folders', kage)
      .send({ encryptedName: metadataBlob() })
      .expect(201);
    const id = await deliver(kage, 1, { folderId: folder.body.id });

    await call('delete', `folders/${folder.body.id}`, kage).expect(204);

    const moved = await call('get', `messages/${id}`, kage).expect(200);
    expect(moved.body.folderId).toBe(kage.inboxId);
  });
});

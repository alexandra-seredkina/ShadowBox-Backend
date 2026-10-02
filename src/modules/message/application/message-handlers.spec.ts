import {
  InMemoryMessageRepository,
  messageSummary,
} from '../../../../test/support/message-repository-fake.js';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import type {
  MessageFolderId,
  MessageId,
  MessageOwnerId,
  MessageScope,
} from '../domain/message.js';
import { ApplyMessageBatchHandler } from './apply-message-batch.handler.js';
import { DeleteMessageHandler } from './delete-message.handler.js';
import { ListMessagesHandler } from './list-messages.handler.js';
import { LoadMessageContentHandler } from './load-message-content.handler.js';
import { LoadMessageHandler } from './load-message.handler.js';
import { UpdateMessageHandler } from './update-message.handler.js';

const KAGE = 'account-kage' as MessageOwnerId;
const OTHER = 'account-other' as MessageOwnerId;
const INBOX = 'folder-inbox' as MessageFolderId;
const TRASH = 'folder-trash' as MessageFolderId;
const FOREIGN_FOLDER = 'folder-foreign' as MessageFolderId;

function messageId(n: number): MessageId {
  return `00000000-0000-7000-8000-${String(n).padStart(12, '0')}` as MessageId;
}

describe('message handlers', () => {
  let repository: InMemoryMessageRepository;

  beforeEach(() => {
    repository = new InMemoryMessageRepository();
    repository.addFolder(KAGE, INBOX);
    repository.addTrash(KAGE, TRASH);
    repository.addFolder(OTHER, FOREIGN_FOLDER);
  });

  /** Message n arrived n minutes after the first one. */
  function addMessages(count: number, ownerId = KAGE): void {
    for (let n = 1; n <= count; n += 1) {
      repository.add(
        ownerId,
        messageSummary({
          id: messageId(n),
          folderId: ownerId === KAGE ? INBOX : FOREIGN_FOLDER,
          receivedAt: new Date(Date.UTC(2020, 0, 15, 12, n)),
        }),
      );
    }
  }

  describe('ListMessagesHandler', () => {
    const list = (
      cursor: Parameters<ListMessagesHandler['execute']>[0]['cursor'],
      scope: MessageScope = { kind: 'folder', folderId: INBOX },
    ): ReturnType<ListMessagesHandler['execute']> =>
      new ListMessagesHandler(repository).execute({
        ownerId: KAGE,
        scope,
        cursor,
        limit: 2,
      });

    it('pages newest first and stops on the last page', async () => {
      addMessages(5);

      const first = await list(null);
      const second = await list(first.next);
      const third = await list(second.next);

      expect(
        [first, second, third].map((page) => page.items.map((m) => m.id)),
      ).toEqual([
        [messageId(5), messageId(4)],
        [messageId(3), messageId(2)],
        [messageId(1)],
      ]);
      expect(third.next).toBeNull();
    });

    it('gives no cursor when the page is exactly full', async () => {
      addMessages(2);

      await expect(list(null)).resolves.toMatchObject({ next: null });
    });

    it('refuses a cursor taken in another scope', async () => {
      addMessages(3);
      const { next } = await list(null);

      await expect(
        list(
          next === null
            ? null
            : { ...next, scope: { kind: 'folder', folderId: TRASH } },
        ),
      ).rejects.toThrow(ValidationFailedError);
      await expect(list(next, { kind: 'starred' })).rejects.toThrow(
        ValidationFailedError,
      );
    });

    it("answers someone else's folder as missing", async () => {
      addMessages(1, OTHER);

      await expect(
        list(null, { kind: 'folder', folderId: FOREIGN_FOLDER }),
      ).rejects.toThrow(NotFoundError);
    });

    it('lists starred messages from every folder but the trash', async () => {
      addMessages(3);
      await new ApplyMessageBatchHandler(repository).execute({
        ownerId: KAGE,
        ids: [messageId(1), messageId(2), messageId(3)],
        action: { kind: 'star' },
      });
      await new UpdateMessageHandler(repository).execute({
        ownerId: KAGE,
        id: messageId(2),
        changes: { folderId: TRASH },
      });

      const page = await list(null, { kind: 'starred' });

      expect(page.items.map((m) => m.id)).toEqual([messageId(3), messageId(1)]);
    });
  });

  describe('LoadMessageHandler and LoadMessageContentHandler', () => {
    it('load only own messages', async () => {
      addMessages(1, OTHER);
      const handlers = [
        new LoadMessageHandler(repository),
        new LoadMessageContentHandler(repository),
      ];

      for (const handler of handlers) {
        await expect(
          handler.execute({ ownerId: KAGE, id: messageId(1) }),
        ).rejects.toThrow(NotFoundError);
      }
      await expect(
        new LoadMessageContentHandler(repository).execute({
          ownerId: OTHER,
          id: messageId(1),
        }),
      ).resolves.toMatchObject({ v: 1 });
    });
  });

  describe('UpdateMessageHandler', () => {
    const update = new UpdateMessageHandler(new InMemoryMessageRepository());

    it('marks read and moves in one call', async () => {
      addMessages(1);

      const updated = await new UpdateMessageHandler(repository).execute({
        ownerId: KAGE,
        id: messageId(1),
        changes: { isRead: true, folderId: TRASH },
      });

      expect(updated).toMatchObject({ isRead: true, folderId: TRASH });
    });

    it("refuses someone else's folder as the target", async () => {
      addMessages(1);

      await expect(
        new UpdateMessageHandler(repository).execute({
          ownerId: KAGE,
          id: messageId(1),
          changes: { folderId: FOREIGN_FOLDER },
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('answers a missing message with not found', async () => {
      await expect(
        update.execute({ ownerId: KAGE, id: messageId(9), changes: {} }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('ApplyMessageBatchHandler', () => {
    it('counts own messages once and skips the rest', async () => {
      addMessages(2);
      repository.add(
        OTHER,
        messageSummary({ id: messageId(3), folderId: FOREIGN_FOLDER }),
      );

      const processed = await new ApplyMessageBatchHandler(repository).execute({
        ownerId: KAGE,
        ids: [messageId(1), messageId(1), messageId(2), messageId(3)],
        action: { kind: 'markRead' },
      });

      expect(processed).toBe(2);
      await expect(repository.find(OTHER, messageId(3))).resolves.toMatchObject(
        { isRead: false },
      );
    });

    it("refuses a move into someone else's folder", async () => {
      addMessages(1);

      await expect(
        new ApplyMessageBatchHandler(repository).execute({
          ownerId: KAGE,
          ids: [messageId(1)],
          action: { kind: 'move', folderId: FOREIGN_FOLDER },
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('DeleteMessageHandler', () => {
    it('deletes own messages and refuses others', async () => {
      addMessages(1);
      const remove = new DeleteMessageHandler(repository);

      await expect(
        remove.execute({ ownerId: OTHER, id: messageId(1) }),
      ).rejects.toThrow(NotFoundError);
      await remove.execute({ ownerId: KAGE, id: messageId(1) });

      await expect(repository.find(KAGE, messageId(1))).resolves.toBeNull();
    });
  });
});

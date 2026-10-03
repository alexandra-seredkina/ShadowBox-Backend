import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { storedBlobSchema } from '../../../shared/http/encrypted-blob.schema.js';
import {
  ENCRYPTED_BLOB_ALGORITHM,
  ENCRYPTED_BLOB_VERSION,
  EncryptedBlob,
} from '../../../shared/kernel/encrypted-blob.js';
import type {
  BatchAction,
  MessageAliasId,
  MessageChanges,
  MessageFolderId,
  MessageId,
  MessageLabelId,
  MessageOwnerId,
  MessagePosition,
  MessageScope,
  MessageSummary,
} from '../domain/message.js';
import { MessageRepository } from '../domain/message.repository.js';

/** The body columns are left out: they can be 25 MiB per row. */
const SUMMARY_FIELDS = {
  id: true,
  folderId: true,
  aliasId: true,
  receivedAt: true,
  isRead: true,
  isStarred: true,
  sizeBytes: true,
  threatVerdict: true,
  threatMarkers: true,
  spfResult: true,
  dkimResult: true,
  dmarcResult: true,
  encryptedPreview: true,
  labels: {
    select: { labelId: true },
    orderBy: { label: { createdAt: 'asc' } },
  },
} as const;

type SummaryRow = Prisma.MessageGetPayload<{ select: typeof SUMMARY_FIELDS }>;

function toSummary(row: SummaryRow): MessageSummary {
  return {
    id: row.id as MessageId,
    folderId: row.folderId as MessageFolderId,
    aliasId: row.aliasId as MessageAliasId | null,
    receivedAt: row.receivedAt,
    isRead: row.isRead,
    isStarred: row.isStarred,
    sizeBytes: row.sizeBytes,
    labelIds: row.labels.map((link) => link.labelId as MessageLabelId),
    threat: {
      verdict: row.threatVerdict,
      markers: row.threatMarkers,
      auth: {
        spf: row.spfResult,
        dkim: row.dkimResult,
        dmarc: row.dmarcResult,
      },
    },
    encryptedPreview: storedBlobSchema.parse(row.encryptedPreview),
  };
}

function after(
  position: MessagePosition | null,
): Prisma.MessageWhereInput | null {
  if (position === null) {
    return null;
  }
  return {
    OR: [
      { receivedAt: { lt: position.receivedAt } },
      { receivedAt: position.receivedAt, id: { lt: position.id } },
    ],
  };
}

type FlagAction = Extract<
  BatchAction,
  { kind: 'markRead' | 'markUnread' | 'star' | 'unstar' | 'move' }
>;

function batchChange(
  action: FlagAction,
): Prisma.MessageUncheckedUpdateManyInput {
  switch (action.kind) {
    case 'markRead':
      return { isRead: true };
    case 'markUnread':
      return { isRead: false };
    case 'star':
      return { isStarred: true };
    case 'unstar':
      return { isStarred: false };
    case 'move':
      return { folderId: action.folderId };
  }
}

@Injectable()
export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isOwnFolder(
    ownerId: MessageOwnerId,
    folderId: MessageFolderId,
  ): Promise<boolean> {
    return isOwnFolder(this.prisma, ownerId, folderId);
  }

  async isOwnLabel(
    ownerId: MessageOwnerId,
    labelId: MessageLabelId,
  ): Promise<boolean> {
    return areOwnLabels(this.prisma, ownerId, [labelId]);
  }

  async list(
    ownerId: MessageOwnerId,
    scope: MessageScope,
    position: MessagePosition | null,
    limit: number,
  ): Promise<MessageSummary[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        accountId: ownerId,
        ...(await this.scopeFilter(ownerId, scope)),
        ...after(position),
      },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: SUMMARY_FIELDS,
    });
    return rows.map(toSummary);
  }

  /** Views across folders leave the trash out. */
  private async scopeFilter(
    ownerId: MessageOwnerId,
    scope: MessageScope,
  ): Promise<Prisma.MessageWhereInput> {
    switch (scope.kind) {
      case 'folder':
        return { folderId: scope.folderId };
      case 'label':
        return {
          labels: { some: { labelId: scope.labelId } },
          folderId: { not: await this.trashOf(ownerId) },
        };
      case 'starred':
        return {
          isStarred: true,
          folderId: { not: await this.trashOf(ownerId) },
        };
    }
  }

  private async trashOf(ownerId: MessageOwnerId): Promise<string> {
    const trash = await this.prisma.folder.findUniqueOrThrow({
      where: {
        accountId_systemRole: { accountId: ownerId, systemRole: 'trash' },
      },
      select: { id: true },
    });
    return trash.id;
  }

  async find(
    ownerId: MessageOwnerId,
    id: MessageId,
  ): Promise<MessageSummary | null> {
    const row = await this.prisma.message.findFirst({
      where: { id, accountId: ownerId },
      select: SUMMARY_FIELDS,
    });
    return row === null ? null : toSummary(row);
  }

  async loadBody(
    ownerId: MessageOwnerId,
    id: MessageId,
  ): Promise<EncryptedBlob | null> {
    const row = await this.prisma.message.findFirst({
      where: { id, accountId: ownerId },
      select: {
        bodyBlobVersion: true,
        bodySealedKey: true,
        bodyNonce: true,
        bodyCiphertext: true,
      },
    });
    if (row === null) {
      return null;
    }
    if (row.bodyBlobVersion !== ENCRYPTED_BLOB_VERSION) {
      throw new Error(`Message ${id} has blob version ${row.bodyBlobVersion}`);
    }
    return {
      v: ENCRYPTED_BLOB_VERSION,
      alg: ENCRYPTED_BLOB_ALGORITHM,
      sealedKey: row.bodySealedKey,
      nonce: row.bodyNonce,
      ciphertext: row.bodyCiphertext,
    };
  }

  async update(
    ownerId: MessageOwnerId,
    id: MessageId,
    changes: MessageChanges,
  ): Promise<MessageSummary | null> {
    return this.prisma.$transaction(async (tx) => {
      const { labelIds, ...flags } = changes;
      const isAllowed =
        (await tx.message.count({ where: { id, accountId: ownerId } })) > 0 &&
        (flags.folderId === undefined ||
          (await isOwnFolder(tx, ownerId, flags.folderId))) &&
        (labelIds === undefined || (await areOwnLabels(tx, ownerId, labelIds)));
      if (!isAllowed) {
        return null;
      }
      await tx.message.update({ where: { id }, data: flags });
      if (labelIds !== undefined) {
        await replaceLabels(tx, id, labelIds);
      }
      const row = await tx.message.findUniqueOrThrow({
        where: { id },
        select: SUMMARY_FIELDS,
      });
      return toSummary(row);
    });
  }

  async applyBatch(
    ownerId: MessageOwnerId,
    ids: readonly MessageId[],
    action: BatchAction,
  ): Promise<number | null> {
    const where = { id: { in: [...ids] }, accountId: ownerId };
    switch (action.kind) {
      case 'delete':
        return (await this.prisma.message.deleteMany({ where })).count;
      case 'label':
      case 'unlabel':
        return this.applyLabel(ownerId, ids, action);
      default:
        return this.prisma.$transaction(async (tx) => {
          if (
            action.kind === 'move' &&
            !(await isOwnFolder(tx, ownerId, action.folderId))
          ) {
            return null;
          }
          const { count } = await tx.message.updateMany({
            where,
            data: batchChange(action),
          });
          return count;
        });
    }
  }

  private applyLabel(
    ownerId: MessageOwnerId,
    ids: readonly MessageId[],
    action: Extract<BatchAction, { kind: 'label' | 'unlabel' }>,
  ): Promise<number | null> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await areOwnLabels(tx, ownerId, [action.labelId]))) {
        return null;
      }
      const own = await tx.message.findMany({
        where: { id: { in: [...ids] }, accountId: ownerId },
        select: { id: true },
      });
      const messageIds = own.map((message) => message.id);
      if (action.kind === 'label') {
        await tx.messageLabel.createMany({
          data: messageIds.map((messageId) => ({
            messageId,
            labelId: action.labelId,
          })),
          skipDuplicates: true,
        });
      } else {
        await tx.messageLabel.deleteMany({
          where: { messageId: { in: messageIds }, labelId: action.labelId },
        });
      }
      return messageIds.length;
    });
  }

  async delete(ownerId: MessageOwnerId, id: MessageId): Promise<boolean> {
    const { count } = await this.prisma.message.deleteMany({
      where: { id, accountId: ownerId },
    });
    return count > 0;
  }
}

async function isOwnFolder(
  client: Prisma.TransactionClient,
  ownerId: MessageOwnerId,
  folderId: MessageFolderId,
): Promise<boolean> {
  const count = await client.folder.count({
    where: { id: folderId, accountId: ownerId },
  });
  return count > 0;
}

async function areOwnLabels(
  client: Prisma.TransactionClient,
  ownerId: MessageOwnerId,
  labelIds: readonly MessageLabelId[],
): Promise<boolean> {
  const wanted = new Set(labelIds);
  const count = await client.label.count({
    where: { id: { in: [...wanted] }, accountId: ownerId },
  });
  return count === wanted.size;
}

async function replaceLabels(
  tx: Prisma.TransactionClient,
  messageId: MessageId,
  labelIds: readonly MessageLabelId[],
): Promise<void> {
  await tx.messageLabel.deleteMany({ where: { messageId } });
  await tx.messageLabel.createMany({
    data: labelIds.map((labelId) => ({ messageId, labelId })),
    skipDuplicates: true,
  });
}

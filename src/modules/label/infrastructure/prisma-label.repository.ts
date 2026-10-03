import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { metadataBlobSchema } from '../../../shared/http/encrypted-blob.schema.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { Label, LabelId, LabelOwnerId } from '../domain/label.js';
import { LabelLimitExceededError } from '../domain/label.errors.js';
import { LabelRepository } from '../domain/label.repository.js';

const LABEL_FIELDS = { id: true, encryptedName: true } as const;

function toDomain(
  row: { readonly id: string; readonly encryptedName: unknown },
  unreadCount: number,
): Label {
  return {
    id: row.id as LabelId,
    encryptedName: metadataBlobSchema.parse(row.encryptedName),
    unreadCount,
  };
}

@Injectable()
export class PrismaLabelRepository implements LabelRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: LabelOwnerId): Promise<Label[]> {
    const [rows, unread] = await Promise.all([
      this.prisma.label.findMany({
        where: { accountId: ownerId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: LABEL_FIELDS,
      }),
      this.unreadByLabel(ownerId),
    ]);
    return rows.map((row) => toDomain(row, unread.get(row.id) ?? 0));
  }

  async create(
    ownerId: LabelOwnerId,
    encryptedName: EncryptedBlobJson,
    maxLabels: number,
  ): Promise<Label> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${ownerId}::uuid FOR UPDATE`;
      if (
        (await tx.label.count({ where: { accountId: ownerId } })) >= maxLabels
      ) {
        throw new LabelLimitExceededError();
      }
      const row = await tx.label.create({
        data: { accountId: ownerId, encryptedName: { ...encryptedName } },
        select: LABEL_FIELDS,
      });
      return toDomain(row, 0);
    });
  }

  async rename(
    ownerId: LabelOwnerId,
    id: LabelId,
    encryptedName: EncryptedBlobJson,
  ): Promise<Label | null> {
    const { count } = await this.prisma.label.updateMany({
      where: { id, accountId: ownerId },
      data: { encryptedName: { ...encryptedName } },
    });
    if (count === 0) {
      return null;
    }
    const [row, unread] = await Promise.all([
      this.prisma.label.findUniqueOrThrow({
        where: { id },
        select: LABEL_FIELDS,
      }),
      this.unreadByLabel(ownerId),
    ]);
    return toDomain(row, unread.get(id) ?? 0);
  }

  async delete(ownerId: LabelOwnerId, id: LabelId): Promise<boolean> {
    const { count } = await this.prisma.label.deleteMany({
      where: { id, accountId: ownerId },
    });
    return count > 0;
  }

  private async unreadByLabel(
    ownerId: LabelOwnerId,
  ): Promise<ReadonlyMap<string, number>> {
    const groups = await this.prisma.messageLabel.groupBy({
      by: ['labelId'],
      where: {
        label: { accountId: ownerId },
        message: { isRead: false, folder: { isNot: { systemRole: 'trash' } } },
      },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.labelId, group._count._all]));
  }
}

import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { metadataBlobSchema } from '../../../shared/http/encrypted-blob.schema.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import {
  Folder,
  FolderId,
  FolderOwnerId,
  SYSTEM_ROLES,
} from '../domain/folder.js';
import {
  FolderIsSystemError,
  FolderLimitExceededError,
} from '../domain/folder.errors.js';
import { FolderRepository } from '../domain/folder.repository.js';

const FOLDER_FIELDS = {
  id: true,
  kind: true,
  systemRole: true,
  encryptedName: true,
  createdAt: true,
} as const;

type FolderRow = Prisma.FolderGetPayload<{ select: typeof FOLDER_FIELDS }>;

function toDomain(row: FolderRow, unreadCount: number): Folder {
  const id = row.id as FolderId;
  if (row.kind === 'system') {
    if (row.systemRole === null) {
      throw new Error(`System folder ${row.id} has no role`);
    }
    return { id, kind: 'system', systemRole: row.systemRole, unreadCount };
  }
  return {
    id,
    kind: 'custom',
    encryptedName: metadataBlobSchema.parse(row.encryptedName),
    unreadCount,
  };
}

function displayOrder(row: FolderRow): number {
  return row.systemRole === null
    ? SYSTEM_ROLES.length
    : SYSTEM_ROLES.indexOf(row.systemRole);
}

@Injectable()
export class PrismaFolderRepository implements FolderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: FolderOwnerId): Promise<Folder[]> {
    const [rows, unread] = await Promise.all([
      this.prisma.folder.findMany({
        where: { accountId: ownerId },
        select: FOLDER_FIELDS,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.message.groupBy({
        by: ['folderId'],
        where: { accountId: ownerId, isRead: false },
        _count: { _all: true },
      }),
    ]);
    const unreadByFolder = new Map(
      unread.map((group) => [group.folderId, group._count._all]),
    );
    return rows
      .toSorted((a, b) => displayOrder(a) - displayOrder(b))
      .map((row) => toDomain(row, unreadByFolder.get(row.id) ?? 0));
  }

  async create(
    ownerId: FolderOwnerId,
    encryptedName: EncryptedBlobJson,
    maxCustom: number,
  ): Promise<Folder> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${ownerId}::uuid FOR UPDATE`;
      const custom = await tx.folder.count({
        where: { accountId: ownerId, kind: 'custom' },
      });
      if (custom >= maxCustom) {
        throw new FolderLimitExceededError();
      }
      const row = await tx.folder.create({
        data: {
          accountId: ownerId,
          kind: 'custom',
          encryptedName: { ...encryptedName },
        },
        select: FOLDER_FIELDS,
      });
      return toDomain(row, 0);
    });
  }

  async rename(
    ownerId: FolderOwnerId,
    id: FolderId,
    encryptedName: EncryptedBlobJson,
  ): Promise<Folder | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await findOwn(tx, ownerId, id);
      if (current === null) {
        return null;
      }
      const row = await tx.folder.update({
        where: { id },
        data: { encryptedName: { ...encryptedName } },
        select: FOLDER_FIELDS,
      });
      const unreadCount = await tx.message.count({
        where: { accountId: ownerId, folderId: id, isRead: false },
      });
      return toDomain(row, unreadCount);
    });
  }

  async delete(ownerId: FolderOwnerId, id: FolderId): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if ((await findOwn(tx, ownerId, id)) === null) {
        return false;
      }
      const inbox = await tx.folder.findUniqueOrThrow({
        where: {
          accountId_systemRole: { accountId: ownerId, systemRole: 'inbox' },
        },
        select: { id: true },
      });
      await tx.message.updateMany({
        where: { accountId: ownerId, folderId: id },
        data: { folderId: inbox.id },
      });
      await tx.alias.updateMany({
        where: { accountId: ownerId, folderId: id },
        data: { folderId: null },
      });
      await tx.folder.delete({ where: { id } });
      return true;
    });
  }
}

/** Null when the folder is not the owner's; system folders are refused here. */
async function findOwn(
  tx: Prisma.TransactionClient,
  ownerId: FolderOwnerId,
  id: FolderId,
): Promise<{ kind: string } | null> {
  const row = await tx.folder.findFirst({
    where: { id, accountId: ownerId },
    select: { kind: true },
  });
  if (row?.kind === 'system') {
    throw new FolderIsSystemError();
  }
  return row;
}

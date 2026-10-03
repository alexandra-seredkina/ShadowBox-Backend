import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { metadataBlobSchema } from '../../../shared/http/encrypted-blob.schema.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type {
  BlockedSender,
  BlockedSenderId,
} from '../domain/blocked-sender.js';
import { BlockLimitExceededError } from '../domain/blocked-sender.errors.js';
import {
  BlockedSenderRepository,
  BlockResult,
} from '../domain/blocked-sender.repository.js';
import type { MessageOwnerId } from '../domain/message.js';
import type { SenderHash } from '../domain/sender-hasher.js';

const FIELDS = { id: true, encryptedAddress: true, createdAt: true } as const;

function toDomain(row: {
  readonly id: string;
  readonly encryptedAddress: unknown;
  readonly createdAt: Date;
}): BlockedSender {
  return {
    id: row.id as BlockedSenderId,
    encryptedAddress: metadataBlobSchema.parse(row.encryptedAddress),
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaBlockedSenderRepository implements BlockedSenderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: MessageOwnerId): Promise<BlockedSender[]> {
    const rows = await this.prisma.blockedSender.findMany({
      where: { accountId: ownerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: FIELDS,
    });
    return rows.map(toDomain);
  }

  async block(
    ownerId: MessageOwnerId,
    sender: SenderHash,
    encryptedAddress: EncryptedBlobJson,
    maxBlocked: number,
  ): Promise<BlockResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${ownerId}::uuid FOR UPDATE`;
      const senderHash = Uint8Array.from(sender.hash);
      const existing = await tx.blockedSender.findUnique({
        where: { accountId_senderHash: { accountId: ownerId, senderHash } },
        select: FIELDS,
      });
      if (existing !== null) {
        return { blocked: toDomain(existing), isNew: false };
      }
      const count = await tx.blockedSender.count({
        where: { accountId: ownerId },
      });
      if (count >= maxBlocked) {
        throw new BlockLimitExceededError();
      }
      const row = await tx.blockedSender.create({
        data: {
          accountId: ownerId,
          senderHash,
          hashKeyVersion: sender.keyVersion,
          encryptedAddress: { ...encryptedAddress },
        },
        select: FIELDS,
      });
      return { blocked: toDomain(row), isNew: true };
    });
  }

  async unblock(
    ownerId: MessageOwnerId,
    id: BlockedSenderId,
  ): Promise<boolean> {
    const { count } = await this.prisma.blockedSender.deleteMany({
      where: { id, accountId: ownerId },
    });
    return count > 0;
  }
}

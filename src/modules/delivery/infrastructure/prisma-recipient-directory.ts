import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  Recipient,
  RecipientAccountId,
  RecipientAddress,
  RecipientAliasId,
} from '../domain/recipient.js';
import { RecipientDirectory } from '../domain/recipient-directory.js';

@Injectable()
export class PrismaRecipientDirectory implements RecipientDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async findDeliverable(
    address: RecipientAddress,
    now: Date,
  ): Promise<Recipient | null> {
    const row = await this.prisma.alias.findFirst({
      where: {
        localPart: address.localPart,
        domain: address.domain,
        status: 'active',
        accountId: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true, accountId: true },
    });
    if (row === null || row.accountId === null) {
      return null;
    }
    return {
      aliasId: row.id as RecipientAliasId,
      accountId: row.accountId as RecipientAccountId,
    };
  }
}

import { Injectable } from '@nestjs/common';
import {
  IdempotencyRepository,
  StoredIdempotentResult,
} from '../../shared/kernel/idempotency.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PrismaIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(
    key: string,
    now: Date,
  ): Promise<StoredIdempotentResult | null> {
    const row = await this.prisma.idempotencyRecord.findFirst({
      where: { key, expiresAt: { gt: now } },
      select: {
        operation: true,
        requestHash: true,
        accountId: true,
        responseBody: true,
      },
    });
    return row === null
      ? null
      : {
          operation: row.operation,
          requestHash: row.requestHash,
          accountId: row.accountId,
          snapshot: row.responseBody,
        };
  }
}

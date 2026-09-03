import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { AccountCredentials, AccountId } from '../domain/account.js';
import { AccountRepository } from '../domain/account.repository.js';

@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCredentialsById(id: AccountId): Promise<AccountCredentials | null> {
    const row = await this.prisma.account.findUnique({
      where: { id },
      select: { id: true, authKeyHash: true, isIpBindingEnabled: true },
    });
    return row === null ? null : { ...row, id: row.id as AccountId };
  }
}

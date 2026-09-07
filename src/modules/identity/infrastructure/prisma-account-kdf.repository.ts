import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { AccountKdfRepository } from '../domain/account-kdf.repository.js';
import type { KdfParams } from '../domain/kdf-params.js';
import type { Login } from '../domain/login.js';
import { KDF_FIELDS, toKdfParams } from './kdf-row.js';

@Injectable()
export class PrismaAccountKdfRepository implements AccountKdfRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByLogin(login: Login): Promise<KdfParams | null> {
    const row = await this.prisma.account.findUnique({
      where: { login },
      select: KDF_FIELDS,
    });
    return row === null ? null : toKdfParams(row);
  }
}

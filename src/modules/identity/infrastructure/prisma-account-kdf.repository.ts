import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { AccountKdfRepository } from '../domain/account-kdf.repository.js';
import { KDF_ALGORITHM, KdfParams } from '../domain/kdf-params.js';
import type { Login } from '../domain/login.js';

@Injectable()
export class PrismaAccountKdfRepository implements AccountKdfRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByLogin(login: Login): Promise<KdfParams | null> {
    const row = await this.prisma.account.findUnique({
      where: { login },
      select: {
        kdfAlgorithm: true,
        kdfSalt: true,
        kdfOpsLimit: true,
        kdfMemLimitBytes: true,
      },
    });
    if (row === null) {
      return null;
    }
    if (row.kdfAlgorithm !== KDF_ALGORITHM) {
      throw new Error(`Unsupported KDF algorithm stored: ${row.kdfAlgorithm}`);
    }
    return {
      algorithm: KDF_ALGORITHM,
      salt: row.kdfSalt,
      opsLimit: row.kdfOpsLimit,
      memLimitBytes: row.kdfMemLimitBytes,
    };
  }
}

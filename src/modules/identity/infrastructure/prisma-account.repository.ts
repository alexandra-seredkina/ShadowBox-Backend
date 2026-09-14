import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  AccountCredentials,
  AccountId,
  AccountKeys,
  AccountSummary,
} from '../domain/account.js';
import { AccountRepository } from '../domain/account.repository.js';
import type { Login } from '../domain/login.js';
import { KDF_FIELDS, toKdfParams } from './kdf-row.js';

const CREDENTIAL_FIELDS = {
  id: true,
  authKeyHash: true,
  isIpBindingEnabled: true,
} as const;

@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCredentialsById(id: AccountId): Promise<AccountCredentials | null> {
    return this.findCredentials({ id });
  }

  findCredentialsByLogin(login: Login): Promise<AccountCredentials | null> {
    return this.findCredentials({ login });
  }

  async loadSummary(id: AccountId, now: Date): Promise<AccountSummary> {
    const [account, activeAliases] = await Promise.all([
      this.prisma.account.findUniqueOrThrow({
        where: { id },
        select: { login: true, createdAt: true, isIpBindingEnabled: true },
      }),
      this.prisma.alias.count({
        where: {
          accountId: id,
          status: 'active',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
    ]);
    return { ...account, id, login: account.login as Login, activeAliases };
  }

  async loadKeys(id: AccountId): Promise<AccountKeys> {
    const row = await this.prisma.account.findUniqueOrThrow({
      where: { id },
      select: {
        ...KDF_FIELDS,
        publicKey: true,
        encryptedPrivateKeyNonce: true,
        encryptedPrivateKeyCiphertext: true,
      },
    });
    return {
      publicKey: row.publicKey,
      encryptedPrivateKey: {
        nonce: row.encryptedPrivateKeyNonce,
        ciphertext: row.encryptedPrivateKeyCiphertext,
      },
      kdf: toKdfParams(row),
    };
  }

  async updateAuthKeyHash(id: AccountId, authKeyHash: string): Promise<void> {
    await this.prisma.account.update({
      where: { id },
      data: { authKeyHash },
      select: { id: true },
    });
  }

  private async findCredentials(
    where: Prisma.AccountWhereUniqueInput,
  ): Promise<AccountCredentials | null> {
    const row = await this.prisma.account.findUnique({
      where,
      select: CREDENTIAL_FIELDS,
    });
    return row === null ? null : { ...row, id: row.id as AccountId };
  }
}

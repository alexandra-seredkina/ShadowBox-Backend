import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  AccountCredentials,
  AccountId,
  AccountKeys,
  AccountSummary,
} from '../domain/account.js';
import { AccountRepository } from '../domain/account.repository.js';
import type { IpHash } from '../../../shared/kernel/ip-hasher.js';
import type { Login } from '../domain/login.js';
import type { SessionId } from '../domain/session.js';
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

  async changeIpBinding(change: {
    readonly accountId: AccountId;
    readonly isEnabled: boolean;
    readonly currentSession: SessionId;
    readonly currentIp: IpHash;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: change.accountId },
        data: { isIpBindingEnabled: change.isEnabled },
        select: { id: true },
      }),
      this.prisma.session.updateMany({
        where: { accountId: change.accountId },
        data: { isIpBound: change.isEnabled },
      }),
      ...(change.isEnabled
        ? [
            this.prisma.session.updateMany({
              where: { id: change.currentSession, accountId: change.accountId },
              data: {
                ipHash: Uint8Array.from(change.currentIp.hash),
                ipHashKeyVersion: change.currentIp.keyVersion,
              },
            }),
          ]
        : []),
    ]);
  }

  async delete(id: AccountId, now: Date): Promise<void> {
    await this.prisma.$transaction([
      // The alias rows outlive the account (account_id becomes NULL), so an
      // address is never issued again.
      this.prisma.alias.updateMany({
        where: { accountId: id, status: { not: 'revoked' } },
        data: {
          status: 'revoked',
          revokedAt: now,
          encryptedLabel: Prisma.DbNull,
          folderId: null,
        },
      }),
      this.prisma.alias.updateMany({
        where: { accountId: id },
        data: { encryptedLabel: Prisma.DbNull, folderId: null },
      }),
      this.prisma.account.delete({ where: { id }, select: { id: true } }),
    ]);
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

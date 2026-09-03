import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { findUniqueViolationModel } from '../../../infrastructure/prisma/unique-violation.js';
import {
  IdempotencyClaim,
  IdempotencyKeyTakenError,
} from '../../../shared/kernel/idempotency.js';
import type { AccountId } from '../domain/account.js';
import { AccountRegistrar } from '../domain/account-registrar.js';
import type { AliasSummary } from '../domain/alias-summary.js';
import {
  AliasAddressTakenError,
  LoginTakenError,
} from '../domain/identity.errors.js';
import type { Login } from '../domain/login.js';
import {
  NewAccount,
  Registration,
  RegistrationResult,
  toRegistrationSnapshot,
} from '../domain/registration.js';
import { toSessionData } from './session-data.js';

const SYSTEM_FOLDER_ROLES = ['inbox', 'spam', 'trash'] as const;
const CREATED = 201;

const ERROR_BY_MODEL: Readonly<Record<string, () => Error>> = {
  Account: () => new LoginTakenError(),
  Alias: () => new AliasAddressTakenError(),
  IdempotencyRecord: () => new IdempotencyKeyTakenError(),
};

const ALIAS_FIELDS = {
  id: true,
  localPart: true,
  domain: true,
  kind: true,
  status: true,
  folderId: true,
  expiresAt: true,
  createdAt: true,
  lastReceivedAt: true,
} as const;

type AliasRow = Prisma.AliasGetPayload<{ select: typeof ALIAS_FIELDS }>;

function toAliasSummary(row: AliasRow): AliasSummary {
  if (row.status === 'revoked') {
    throw new Error('A freshly created alias cannot be revoked');
  }
  return { ...row, status: row.status };
}

function toAccountData(account: NewAccount): Prisma.AccountCreateInput {
  return {
    login: account.login,
    authKeyHash: account.authKeyHash,
    kdfAlgorithm: account.kdf.algorithm,
    kdfSalt: Uint8Array.from(account.kdf.salt),
    kdfOpsLimit: account.kdf.opsLimit,
    kdfMemLimitBytes: account.kdf.memLimitBytes,
    publicKey: Uint8Array.from(account.publicKey),
    encryptedPrivateKeyNonce: Uint8Array.from(
      account.encryptedPrivateKey.nonce,
    ),
    encryptedPrivateKeyCiphertext: Uint8Array.from(
      account.encryptedPrivateKey.ciphertext,
    ),
    recoveryEncryptedPrivateKeyNonce: Uint8Array.from(
      account.recoveryEncryptedPrivateKey.nonce,
    ),
    recoveryEncryptedPrivateKeyCiphertext: Uint8Array.from(
      account.recoveryEncryptedPrivateKey.ciphertext,
    ),
  };
}

@Injectable()
export class PrismaAccountRegistrar implements AccountRegistrar {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    registration: Registration,
    idempotency: IdempotencyClaim | null,
  ): Promise<RegistrationResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const result = await this.createAccount(tx, registration);
        if (idempotency !== null) {
          await tx.idempotencyRecord.create({
            data: {
              key: idempotency.key,
              accountId: result.account.id,
              operation: idempotency.operation,
              requestHash: Uint8Array.from(idempotency.requestHash),
              responseStatus: CREATED,
              responseBody: toRegistrationSnapshot(result),
              expiresAt: idempotency.expiresAt,
            },
          });
        }
        return result;
      });
    } catch (error) {
      const model = findUniqueViolationModel(error);
      const translate = model === null ? undefined : ERROR_BY_MODEL[model];
      throw translate === undefined ? error : translate();
    }
  }

  private async createAccount(
    tx: Prisma.TransactionClient,
    registration: Registration,
  ): Promise<RegistrationResult> {
    const account = await tx.account.create({
      data: toAccountData(registration.account),
      select: {
        id: true,
        login: true,
        createdAt: true,
        isIpBindingEnabled: true,
      },
    });
    await tx.folder.createMany({
      data: SYSTEM_FOLDER_ROLES.map((systemRole) => ({
        accountId: account.id,
        kind: 'system' as const,
        systemRole,
      })),
    });
    const alias = await tx.alias.create({
      data: {
        accountId: account.id,
        localPart: registration.firstAlias.localPart,
        domain: registration.firstAlias.domain,
        kind: 'permanent',
      },
      select: ALIAS_FIELDS,
    });
    const accountId = account.id as AccountId;
    await tx.session.create({
      data: toSessionData(accountId, registration.session),
    });
    return {
      account: {
        ...account,
        id: accountId,
        login: account.login as Login,
        activeAliases: 1,
      },
      firstAlias: toAliasSummary(alias),
    };
  }
}

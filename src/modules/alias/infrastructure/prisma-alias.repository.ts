import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { findUniqueViolationModel } from '../../../infrastructure/prisma/unique-violation.js';
import { metadataBlobSchema } from '../../../shared/http/encrypted-blob.schema.js';
import { AliasAddressTakenError } from '../../../shared/kernel/alias-local-part.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import {
  IdempotencyClaim,
  IdempotencyKeyTakenError,
} from '../../../shared/kernel/idempotency.js';
import {
  Alias,
  AliasChanges,
  AliasId,
  AliasStatus,
  OwnerId,
  toAliasSnapshot,
} from '../domain/alias.js';
import { AliasLimitExceededError } from '../domain/alias.errors.js';
import { AliasRepository, NewAlias } from '../domain/alias.repository.js';

const CREATED = 201;

const ALIAS_FIELDS = {
  id: true,
  localPart: true,
  domain: true,
  kind: true,
  status: true,
  encryptedLabel: true,
  folderId: true,
  expiresAt: true,
  createdAt: true,
  lastReceivedAt: true,
} as const;

type AliasRow = Prisma.AliasGetPayload<{ select: typeof ALIAS_FIELDS }>;

const ERROR_BY_MODEL: Readonly<Record<string, () => Error>> = {
  Alias: () => new AliasAddressTakenError(),
  IdempotencyRecord: () => new IdempotencyKeyTakenError(),
};

function toDomain(row: AliasRow): Alias {
  if (row.status === 'revoked') {
    throw new Error('A revoked alias must never leave the repository');
  }
  return {
    ...row,
    id: row.id as AliasId,
    status: row.status,
    encryptedLabel:
      row.encryptedLabel === null
        ? null
        : metadataBlobSchema.parse(row.encryptedLabel),
  };
}

function toJsonColumn(
  blob: EncryptedBlobJson | null,
): Prisma.InputJsonObject | typeof Prisma.DbNull {
  return blob === null ? Prisma.DbNull : { ...blob };
}

/** Not revoked and, for temporary addresses, not past `expiresAt`. */
function liveWhere(
  ownerId: OwnerId,
  now: Date,
  status: AliasStatus | null = null,
): Prisma.AliasWhereInput {
  return {
    accountId: ownerId,
    status: status ?? { in: ['active', 'disabled'] },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

function translateUniqueViolation(error: unknown): unknown {
  const model = findUniqueViolationModel(error);
  const translate = model === null ? undefined : ERROR_BY_MODEL[model];
  return translate === undefined ? error : translate();
}

@Injectable()
export class PrismaAliasRepository implements AliasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    ownerId: OwnerId,
    filter: { readonly status: AliasStatus | null; readonly now: Date },
  ): Promise<Alias[]> {
    const rows = await this.prisma.alias.findMany({
      where: liveWhere(ownerId, filter.now, filter.status),
      select: ALIAS_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDomain);
  }

  async findOwn(
    ownerId: OwnerId,
    id: AliasId,
    now: Date,
  ): Promise<Alias | null> {
    const row = await this.prisma.alias.findFirst({
      where: { ...liveWhere(ownerId, now), id },
      select: ALIAS_FIELDS,
    });
    return row === null ? null : toDomain(row);
  }

  async create(
    alias: NewAlias,
    options: {
      readonly maxActive: number;
      readonly now: Date;
      readonly idempotency: IdempotencyClaim | null;
    },
  ): Promise<Alias> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockOwner(tx, alias.ownerId);
        await ensureRoomForActive(tx, alias.ownerId, options);
        const row = await tx.alias.create({
          data: {
            accountId: alias.ownerId,
            localPart: alias.localPart,
            domain: alias.domain,
            kind: alias.kind,
            expiresAt: alias.expiresAt,
            encryptedLabel: toJsonColumn(alias.encryptedLabel),
            folderId: alias.folderId,
          },
          select: ALIAS_FIELDS,
        });
        const created = toDomain(row);
        if (options.idempotency !== null) {
          await recordCreation(tx, alias.ownerId, options.idempotency, created);
        }
        return created;
      });
    } catch (error) {
      throw translateUniqueViolation(error);
    }
  }

  async update(
    ownerId: OwnerId,
    id: AliasId,
    changes: AliasChanges,
    options: { readonly maxActive: number; readonly now: Date },
  ): Promise<Alias | null> {
    return this.prisma.$transaction(async (tx) => {
      if (changes.status === 'active') {
        await lockOwner(tx, ownerId);
      }
      const current = await tx.alias.findFirst({
        where: { ...liveWhere(ownerId, options.now), id },
        select: { status: true },
      });
      if (current === null) {
        return null;
      }
      if (changes.status === 'active' && current.status !== 'active') {
        await ensureRoomForActive(tx, ownerId, options);
      }
      const row = await tx.alias.update({
        where: { id },
        data: {
          ...(changes.status === undefined ? {} : { status: changes.status }),
          ...(changes.encryptedLabel === undefined
            ? {}
            : { encryptedLabel: toJsonColumn(changes.encryptedLabel) }),
          ...(changes.folderId === undefined
            ? {}
            : { folderId: changes.folderId }),
        },
        select: ALIAS_FIELDS,
      });
      return toDomain(row);
    });
  }

  async revoke(ownerId: OwnerId, id: AliasId, now: Date): Promise<void> {
    await this.prisma.alias.updateMany({
      where: { ...liveWhere(ownerId, now), id },
      data: {
        status: 'revoked',
        revokedAt: now,
        encryptedLabel: Prisma.DbNull,
        folderId: null,
      },
    });
  }
}

/** Serialises writes that may add an active address for the same owner. */
async function lockOwner(
  tx: Prisma.TransactionClient,
  ownerId: OwnerId,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${ownerId}::uuid FOR UPDATE`;
}

async function ensureRoomForActive(
  tx: Prisma.TransactionClient,
  ownerId: OwnerId,
  options: { readonly maxActive: number; readonly now: Date },
): Promise<void> {
  const active = await tx.alias.count({
    where: liveWhere(ownerId, options.now, 'active'),
  });
  if (active >= options.maxActive) {
    throw new AliasLimitExceededError();
  }
}

async function recordCreation(
  tx: Prisma.TransactionClient,
  ownerId: OwnerId,
  claim: IdempotencyClaim,
  created: Alias,
): Promise<void> {
  await tx.idempotencyRecord.create({
    data: {
      key: claim.key,
      accountId: ownerId,
      operation: claim.operation,
      requestHash: Uint8Array.from(claim.requestHash),
      responseStatus: CREATED,
      responseBody: toAliasSnapshot(created),
      expiresAt: claim.expiresAt,
    },
  });
}

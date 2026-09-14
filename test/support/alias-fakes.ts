import { randomUUID } from 'node:crypto';
import type {
  Alias,
  AliasChanges,
  AliasId,
  AliasStatus,
  OwnerId,
} from '../../src/modules/alias/domain/alias.js';
import { toAliasSnapshot } from '../../src/modules/alias/domain/alias.js';
import { AliasLimitExceededError } from '../../src/modules/alias/domain/alias.errors.js';
import {
  AliasRepository,
  NewAlias,
} from '../../src/modules/alias/domain/alias.repository.js';
import { FolderDirectory } from '../../src/modules/alias/domain/folder-directory.js';
import { AliasAddressTakenError } from '../../src/shared/kernel/alias-local-part.js';
import {
  IdempotencyClaim,
  IdempotencyKeyTakenError,
  IdempotencyRepository,
  StoredIdempotentResult,
} from '../../src/shared/kernel/idempotency.js';

type StoredAlias = {
  -readonly [K in keyof Omit<Alias, 'status'>]: Alias[K];
} & {
  ownerId: OwnerId;
  status: AliasStatus | 'revoked';
};

/** Aliases and the idempotency records of their creation. */
export class InMemoryAliasRepository
  implements AliasRepository, IdempotencyRepository
{
  readonly rows: StoredAlias[] = [];
  readonly records = new Map<
    string,
    StoredIdempotentResult & { expiresAt: Date }
  >();
  /** Addresses that already exist, to exercise the retry on collision. */
  readonly takenAddresses = new Set<string>();

  list(
    ownerId: OwnerId,
    filter: { readonly status: AliasStatus | null; readonly now: Date },
  ): Promise<Alias[]> {
    const found = this.live(ownerId, filter.now)
      .filter((row) => filter.status === null || row.status === filter.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(found.map(toAlias));
  }

  findOwn(ownerId: OwnerId, id: AliasId, now: Date): Promise<Alias | null> {
    const row = this.live(ownerId, now).find(
      (candidate) => candidate.id === id,
    );
    return Promise.resolve(row === undefined ? null : toAlias(row));
  }

  create(
    alias: NewAlias,
    options: {
      readonly maxActive: number;
      readonly now: Date;
      readonly idempotency: IdempotencyClaim | null;
    },
  ): Promise<Alias> {
    const address = `${alias.localPart}@${alias.domain}`;
    if (this.takenAddresses.has(address)) {
      return Promise.reject(new AliasAddressTakenError());
    }
    if (this.activeCount(alias.ownerId, options.now) >= options.maxActive) {
      return Promise.reject(new AliasLimitExceededError());
    }
    const { idempotency } = options;
    if (idempotency !== null && this.records.has(idempotency.key)) {
      return Promise.reject(new IdempotencyKeyTakenError());
    }
    const row: StoredAlias = {
      ...alias,
      id: randomUUID() as AliasId,
      status: 'active',
      createdAt: options.now,
      lastReceivedAt: null,
    };
    this.rows.push(row);
    this.takenAddresses.add(address);
    const created = toAlias(row);
    if (idempotency !== null) {
      this.records.set(idempotency.key, {
        operation: idempotency.operation,
        requestHash: idempotency.requestHash,
        accountId: alias.ownerId,
        snapshot: JSON.parse(JSON.stringify(toAliasSnapshot(created))),
        expiresAt: idempotency.expiresAt,
      });
    }
    return Promise.resolve(created);
  }

  update(
    ownerId: OwnerId,
    id: AliasId,
    changes: AliasChanges,
    options: { readonly maxActive: number; readonly now: Date },
  ): Promise<Alias | null> {
    const row = this.live(ownerId, options.now).find((c) => c.id === id);
    if (row === undefined) {
      return Promise.resolve(null);
    }
    if (
      changes.status === 'active' &&
      row.status !== 'active' &&
      this.activeCount(ownerId, options.now) >= options.maxActive
    ) {
      return Promise.reject(new AliasLimitExceededError());
    }
    Object.assign(
      row,
      Object.fromEntries(
        Object.entries(changes).filter(([, value]) => value !== undefined),
      ),
    );
    return Promise.resolve(toAlias(row));
  }

  revoke(ownerId: OwnerId, id: AliasId, now: Date): Promise<void> {
    const row = this.live(ownerId, now).find((c) => c.id === id);
    if (row !== undefined) {
      row.status = 'revoked';
      row.encryptedLabel = null;
      row.folderId = null;
    }
    return Promise.resolve();
  }

  findByKey(key: string, now: Date): Promise<StoredIdempotentResult | null> {
    const record = this.records.get(key);
    return Promise.resolve(
      record === undefined || record.expiresAt <= now ? null : record,
    );
  }

  private live(ownerId: OwnerId, now: Date): StoredAlias[] {
    return this.rows.filter(
      (row) =>
        row.ownerId === ownerId &&
        row.status !== 'revoked' &&
        (row.expiresAt === null || row.expiresAt > now),
    );
  }

  private activeCount(ownerId: OwnerId, now: Date): number {
    return this.live(ownerId, now).filter((row) => row.status === 'active')
      .length;
  }
}

function toAlias(row: StoredAlias): Alias {
  if (row.status === 'revoked') {
    throw new Error('Revoked aliases are never returned');
  }
  const { ownerId: _, ...alias } = row;
  return { ...alias, status: row.status };
}

export class InMemoryFolderDirectory implements FolderDirectory {
  readonly folders = new Map<string, OwnerId>();

  isOwnFolder(ownerId: OwnerId, folderId: string): Promise<boolean> {
    return Promise.resolve(this.folders.get(folderId) === ownerId);
  }
}

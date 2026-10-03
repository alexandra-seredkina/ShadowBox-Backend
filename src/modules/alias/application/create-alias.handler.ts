import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import { IdempotencyConflictError } from '../../../shared/errors/idempotency-conflict.error.js';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { RateLimitedError } from '../../../shared/errors/rate-limited.error.js';
import {
  AliasAddressTakenError,
  generateAliasLocalPart,
} from '../../../shared/kernel/alias-local-part.js';
import {
  AttemptCounter,
  secondsUntil,
} from '../../../shared/kernel/attempt-counter.js';
import { Clock } from '../../../shared/kernel/clock.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import {
  IDEMPOTENCY_TTL_MS,
  IdempotencyClaim,
  IdempotencyKeyTakenError,
  IdempotencyRepository,
} from '../../../shared/kernel/idempotency.js';
import { SecureRandom } from '../../../shared/kernel/secure-random.js';
import {
  Alias,
  AliasLifetime,
  expiresAtFor,
  fromAliasSnapshot,
  MAX_ACTIVE_ALIASES,
  OwnerId,
} from '../domain/alias.js';
import { AliasRepository } from '../domain/alias.repository.js';
import { FolderDirectory } from '../domain/folder-directory.js';
import { LabelDirectory } from '../domain/label-directory.js';

export const CREATE_ALIAS_OPERATION = 'aliases.create';
const CREATIONS_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;
/** A collision of two random 10-character addresses is already unlikely. */
const MAX_ADDRESS_ATTEMPTS = 3;

export interface CreateAliasCommand {
  readonly ownerId: OwnerId;
  readonly lifetime: AliasLifetime;
  readonly encryptedLabel: EncryptedBlobJson | null;
  readonly folderId: string | null;
  readonly labelIds: readonly string[];
  readonly idempotencyKey: string | null;
}

function hashRequest(command: CreateAliasCommand): Uint8Array {
  const { lifetime, encryptedLabel, folderId, labelIds } = command;
  const fields = [
    lifetime.kind,
    lifetime.kind === 'temporary' ? lifetime.ttl : null,
    encryptedLabel,
    folderId,
    // Left out when empty, so keys used before labels existed still replay.
    ...(labelIds.length === 0 ? [] : [labelIds]),
  ];
  return createHash('sha256').update(JSON.stringify(fields)).digest();
}

@Injectable()
export class CreateAliasHandler {
  constructor(
    private readonly aliases: AliasRepository,
    private readonly folders: FolderDirectory,
    private readonly labels: LabelDirectory,
    private readonly idempotency: IdempotencyRepository,
    private readonly counter: AttemptCounter,
    private readonly random: SecureRandom,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async execute(command: CreateAliasCommand): Promise<Alias> {
    const requestHash = hashRequest(command);
    const replayed = await this.replay(command, requestHash);
    if (replayed !== null) {
      return replayed;
    }
    await this.throttle(command.ownerId);
    if (
      (command.folderId !== null &&
        !(await this.folders.isOwnFolder(command.ownerId, command.folderId))) ||
      !(await this.labels.areOwnLabels(command.ownerId, command.labelIds))
    ) {
      throw new NotFoundError();
    }
    try {
      return await this.createWithFreshAddress(command, requestHash);
    } catch (error) {
      if (!(error instanceof IdempotencyKeyTakenError)) {
        throw error;
      }
      return (await this.replay(command, requestHash)) ?? Promise.reject(error);
    }
  }

  private async createWithFreshAddress(
    command: CreateAliasCommand,
    requestHash: Uint8Array,
  ): Promise<Alias> {
    const now = this.clock.now();
    const idempotency = this.claimFor(command.idempotencyKey, requestHash, now);
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.aliases.create(
          {
            ownerId: command.ownerId,
            localPart: generateAliasLocalPart(this.random),
            domain: this.config.mailDomain,
            kind: command.lifetime.kind,
            expiresAt: expiresAtFor(command.lifetime, now),
            encryptedLabel: command.encryptedLabel,
            folderId: command.folderId,
            labelIds: command.labelIds,
          },
          { maxActive: MAX_ACTIVE_ALIASES, now, idempotency },
        );
      } catch (error) {
        if (
          !(error instanceof AliasAddressTakenError) ||
          attempt >= MAX_ADDRESS_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
  }

  /** Replays do not count towards the hourly budget; new creations do. */
  private async throttle(ownerId: OwnerId): Promise<void> {
    const now = this.clock.now();
    const window = await this.counter.increment(
      { scope: `rate:${CREATE_ALIAS_OPERATION}`, subject: ownerId },
      HOUR_MS,
      now,
    );
    if (window.count > CREATIONS_PER_HOUR) {
      throw new RateLimitedError(secondsUntil(window.resetsAt, now));
    }
  }

  private claimFor(
    key: string | null,
    requestHash: Uint8Array,
    now: Date,
  ): IdempotencyClaim | null {
    return key === null
      ? null
      : {
          key,
          operation: CREATE_ALIAS_OPERATION,
          requestHash,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        };
  }

  private async replay(
    command: CreateAliasCommand,
    requestHash: Uint8Array,
  ): Promise<Alias | null> {
    if (command.idempotencyKey === null) {
      return null;
    }
    const stored = await this.idempotency.findByKey(
      command.idempotencyKey,
      this.clock.now(),
    );
    if (stored === null) {
      return null;
    }
    const isSameRequest =
      stored.operation === CREATE_ALIAS_OPERATION &&
      stored.accountId === command.ownerId &&
      Buffer.from(stored.requestHash).equals(requestHash);
    if (!isSameRequest) {
      throw new IdempotencyConflictError();
    }
    return fromAliasSnapshot(stored.snapshot);
  }
}

import type { IdempotencyClaim } from '../../../shared/kernel/idempotency.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type {
  Alias,
  AliasChanges,
  AliasId,
  AliasKind,
  AliasStatus,
  OwnerId,
} from './alias.js';

export interface NewAlias {
  readonly ownerId: OwnerId;
  readonly localPart: string;
  readonly domain: string;
  readonly kind: AliasKind;
  readonly expiresAt: Date | null;
  readonly encryptedLabel: EncryptedBlobJson | null;
  readonly folderId: string | null;
}

/**
 * Every lookup is scoped to the owner and treats revoked and expired
 * addresses as missing. Writes that can add an active address hold a lock on
 * the owner, so concurrent requests cannot overshoot the limit.
 */
export abstract class AliasRepository {
  abstract list(
    ownerId: OwnerId,
    filter: { readonly status: AliasStatus | null; readonly now: Date },
  ): Promise<Alias[]>;

  abstract findOwn(
    ownerId: OwnerId,
    id: AliasId,
    now: Date,
  ): Promise<Alias | null>;

  /** @throws AliasLimitExceededError, AliasAddressTakenError, IdempotencyKeyTakenError */
  abstract create(
    alias: NewAlias,
    options: {
      readonly maxActive: number;
      readonly now: Date;
      readonly idempotency: IdempotencyClaim | null;
    },
  ): Promise<Alias>;

  /**
   * @returns null when the address is not the owner's (any more).
   * @throws AliasLimitExceededError when enabling it would exceed the limit.
   */
  abstract update(
    ownerId: OwnerId,
    id: AliasId,
    changes: AliasChanges,
    options: { readonly maxActive: number; readonly now: Date },
  ): Promise<Alias | null>;

  /** Revokes for good and wipes the label and folder. */
  abstract revoke(ownerId: OwnerId, id: AliasId, now: Date): Promise<void>;
}

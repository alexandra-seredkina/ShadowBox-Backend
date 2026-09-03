export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyClaim {
  readonly key: string;
  readonly operation: string;
  /** SHA-256 of the validated request, to tell a retry from a different request. */
  readonly requestHash: Uint8Array;
  readonly expiresAt: Date;
}

export interface StoredIdempotentResult {
  readonly operation: string;
  readonly requestHash: Uint8Array;
  readonly accountId: string | null;
  readonly snapshot: unknown;
}

export abstract class IdempotencyRepository {
  /** Expired records are treated as absent. */
  abstract findByKey(
    key: string,
    now: Date,
  ): Promise<StoredIdempotentResult | null>;
}

/** Raised by a writer when the key was claimed concurrently. */
export class IdempotencyKeyTakenError extends Error {
  constructor() {
    super('Idempotency key is already used');
    this.name = 'IdempotencyKeyTakenError';
  }
}

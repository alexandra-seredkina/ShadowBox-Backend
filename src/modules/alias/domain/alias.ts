import { z } from 'zod';
import type { Brand } from '../../../shared/kernel/brand.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';

export type AliasId = Brand<string, 'AliasId'>;
/** Accounts are owned by identity; here only their id is needed. */
export type OwnerId = Brand<string, 'OwnerId'>;

export const ALIAS_KINDS = ['permanent', 'temporary'] as const;
export type AliasKind = (typeof ALIAS_KINDS)[number];

/** `revoked` exists only in storage: a revoked address is gone for its owner. */
export const ALIAS_STATUSES = ['active', 'disabled'] as const;
export type AliasStatus = (typeof ALIAS_STATUSES)[number];

const HOUR_MS = 60 * 60 * 1000;
export const ALIAS_TTL_MS = {
  '1h': HOUR_MS,
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
  '30d': 30 * 24 * HOUR_MS,
} as const;
export type AliasTtl = keyof typeof ALIAS_TTL_MS;
export const ALIAS_TTLS = Object.keys(ALIAS_TTL_MS) as readonly AliasTtl[];

export const MAX_ACTIVE_ALIASES = 20;

export interface Alias {
  readonly id: AliasId;
  readonly localPart: string;
  readonly domain: string;
  readonly kind: AliasKind;
  readonly status: AliasStatus;
  readonly encryptedLabel: EncryptedBlobJson | null;
  readonly folderId: string | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly lastReceivedAt: Date | null;
}

/** Permanent addresses never expire; temporary ones live for their TTL from creation. */
export type AliasLifetime =
  | { readonly kind: 'permanent' }
  | { readonly kind: 'temporary'; readonly ttl: AliasTtl };

export function expiresAtFor(lifetime: AliasLifetime, now: Date): Date | null {
  return lifetime.kind === 'permanent'
    ? null
    : new Date(now.getTime() + ALIAS_TTL_MS[lifetime.ttl]);
}

/** Absent or undefined fields stay as they are. */
export interface AliasChanges {
  readonly status?: AliasStatus | undefined;
  readonly encryptedLabel?: EncryptedBlobJson | null | undefined;
  readonly folderId?: string | null | undefined;
}

const blobSnapshotSchema = z.strictObject({
  v: z.literal(1),
  alg: z.literal('x25519-xchacha20poly1305'),
  sealedKey: z.string(),
  nonce: z.string(),
  ciphertext: z.string(),
});

/** JSON form kept with the idempotency record of a creation. */
const snapshotSchema = z.strictObject({
  id: z.string(),
  localPart: z.string(),
  domain: z.string(),
  kind: z.enum(ALIAS_KINDS),
  status: z.enum(ALIAS_STATUSES),
  encryptedLabel: blobSnapshotSchema.nullable(),
  folderId: z.string().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  lastReceivedAt: z.iso.datetime().nullable(),
});

export type AliasSnapshot = z.input<typeof snapshotSchema>;

const isoOrNull = (instant: Date | null): string | null =>
  instant === null ? null : instant.toISOString();
const dateOrNull = (iso: string | null): Date | null =>
  iso === null ? null : new Date(iso);

export function toAliasSnapshot(alias: Alias): AliasSnapshot {
  return {
    ...alias,
    expiresAt: isoOrNull(alias.expiresAt),
    createdAt: alias.createdAt.toISOString(),
    lastReceivedAt: isoOrNull(alias.lastReceivedAt),
  };
}

export function fromAliasSnapshot(value: unknown): Alias {
  const snapshot = snapshotSchema.parse(value);
  return {
    ...snapshot,
    id: snapshot.id as AliasId,
    expiresAt: dateOrNull(snapshot.expiresAt),
    createdAt: new Date(snapshot.createdAt),
    lastReceivedAt: dateOrNull(snapshot.lastReceivedAt),
  };
}

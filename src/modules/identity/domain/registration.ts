import { z } from 'zod';
import type {
  AccountId,
  AccountSummary,
  EncryptedPrivateKey,
} from './account.js';
import type { AliasSummary } from './alias-summary.js';
import type { KdfParams } from './kdf-params.js';
import type { Login } from './login.js';
import type { SessionDraft } from './session.js';

export const REGISTER_OPERATION = 'auth.register';

export interface NewAccount {
  readonly login: Login;
  readonly authKeyHash: string;
  readonly kdf: KdfParams;
  readonly publicKey: Uint8Array;
  readonly encryptedPrivateKey: EncryptedPrivateKey;
  readonly recoveryEncryptedPrivateKey: EncryptedPrivateKey;
}

export interface Registration {
  readonly account: NewAccount;
  readonly firstAlias: { readonly localPart: string; readonly domain: string };
  readonly session: SessionDraft;
}

export interface RegistrationResult {
  readonly account: AccountSummary;
  readonly firstAlias: AliasSummary;
}

/** JSON form kept with the idempotency record, so a retry gets the original answer. */
const snapshotSchema = z.strictObject({
  account: z.strictObject({
    id: z.string(),
    login: z.string(),
    createdAt: z.iso.datetime(),
    isIpBindingEnabled: z.boolean(),
    activeAliases: z.number().int(),
  }),
  firstAlias: z.strictObject({
    id: z.string(),
    localPart: z.string(),
    domain: z.string(),
    kind: z.enum(['permanent', 'temporary']),
    status: z.enum(['active', 'disabled']),
    folderId: z.string().nullable(),
    expiresAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    lastReceivedAt: z.iso.datetime().nullable(),
  }),
});

export type RegistrationSnapshot = z.input<typeof snapshotSchema>;

function isoOrNull(instant: Date | null): string | null {
  return instant === null ? null : instant.toISOString();
}

function dateOrNull(iso: string | null): Date | null {
  return iso === null ? null : new Date(iso);
}

export function toRegistrationSnapshot(
  result: RegistrationResult,
): RegistrationSnapshot {
  const { account, firstAlias } = result;
  return {
    account: { ...account, createdAt: account.createdAt.toISOString() },
    firstAlias: {
      ...firstAlias,
      expiresAt: isoOrNull(firstAlias.expiresAt),
      createdAt: firstAlias.createdAt.toISOString(),
      lastReceivedAt: isoOrNull(firstAlias.lastReceivedAt),
    },
  };
}

/** Throws on a snapshot that was not written by toRegistrationSnapshot. */
export function fromRegistrationSnapshot(value: unknown): RegistrationResult {
  const { account, firstAlias } = snapshotSchema.parse(value);
  return {
    account: {
      ...account,
      id: account.id as AccountId,
      login: account.login as Login,
      createdAt: new Date(account.createdAt),
    },
    firstAlias: {
      ...firstAlias,
      expiresAt: dateOrNull(firstAlias.expiresAt),
      createdAt: new Date(firstAlias.createdAt),
      lastReceivedAt: dateOrNull(firstAlias.lastReceivedAt),
    },
  };
}

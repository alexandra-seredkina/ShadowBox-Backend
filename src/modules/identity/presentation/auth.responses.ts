import {
  toApiDate,
  toApiInstant,
  toBase64Url,
} from '../../../shared/http/api-format.js';
import type { AccountKeys, AccountSummary } from '../domain/account.js';
import {
  MAX_ACTIVE_ALIASES_PER_ACCOUNT,
  MAX_MESSAGE_BYTES,
} from '../domain/account-limits.js';
import type { AliasSummary } from '../domain/alias-summary.js';
import type { KdfParams } from '../domain/kdf-params.js';
import type { PowChallenge } from '../domain/pow-challenge.js';
import type { RegistrationResult } from '../domain/registration.js';
import type { SessionState } from '../application/load-session-state.handler.js';
import type { SignInOutcome } from '../application/sign-in.handler.js';

export interface PowChallengeResponse {
  readonly challengeId: string;
  readonly prefix: string;
  readonly difficulty: number;
  readonly expiresAt: string;
}

export interface KdfParamsResponse {
  readonly algorithm: string;
  readonly salt: string;
  readonly opsLimit: number;
  readonly memLimitBytes: number;
}

export interface PreloginResponse {
  readonly kdf: KdfParamsResponse;
}

export interface AccountResponse {
  readonly login: string;
  readonly createdAt: string;
  readonly settings: { readonly ipBinding: boolean };
  readonly limits: {
    readonly maxActiveAliases: number;
    readonly activeAliases: number;
    readonly maxMessageBytes: number;
  };
}

export interface AliasResponse {
  readonly id: string;
  readonly address: string;
  readonly kind: string;
  readonly status: string;
  readonly encryptedLabel: null;
  readonly folderId: string | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly lastReceivedAt: string | null;
}

export interface KeysResponse {
  readonly publicKey: string;
  readonly encryptedPrivateKey: {
    readonly nonce: string;
    readonly ciphertext: string;
  };
  readonly kdf: KdfParamsResponse;
}

export interface SignInResponse {
  readonly account: AccountResponse;
  readonly keys: KeysResponse;
}

export interface SessionStateResponse extends SignInResponse {
  readonly session: {
    readonly id: string;
    readonly reauthUntil: string | null;
  };
}

export interface RegisterResponse {
  readonly account: AccountResponse;
  readonly firstAlias: AliasResponse;
}

export function toPowChallengeResponse(
  challenge: PowChallenge,
): PowChallengeResponse {
  return {
    challengeId: challenge.id,
    prefix: toBase64Url(challenge.prefix),
    difficulty: challenge.difficulty,
    expiresAt: toApiInstant(challenge.expiresAt),
  };
}

export function toKdfParamsResponse(params: KdfParams): KdfParamsResponse {
  return {
    algorithm: params.algorithm,
    salt: toBase64Url(params.salt),
    opsLimit: params.opsLimit,
    memLimitBytes: params.memLimitBytes,
  };
}

export function toAccountResponse(account: AccountSummary): AccountResponse {
  return {
    login: account.login,
    createdAt: toApiDate(account.createdAt),
    settings: { ipBinding: account.isIpBindingEnabled },
    limits: {
      maxActiveAliases: MAX_ACTIVE_ALIASES_PER_ACCOUNT,
      activeAliases: account.activeAliases,
      maxMessageBytes: MAX_MESSAGE_BYTES,
    },
  };
}

/** The first address never has a label yet; labels arrive with the alias module. */
export function toAliasResponse(alias: AliasSummary): AliasResponse {
  return {
    id: alias.id,
    address: `${alias.localPart}@${alias.domain}`,
    kind: alias.kind,
    status: alias.status,
    encryptedLabel: null,
    folderId: alias.folderId,
    expiresAt: alias.expiresAt === null ? null : toApiInstant(alias.expiresAt),
    createdAt: toApiDate(alias.createdAt),
    lastReceivedAt:
      alias.lastReceivedAt === null ? null : toApiDate(alias.lastReceivedAt),
  };
}

export function toRegisterResponse(
  result: RegistrationResult,
): RegisterResponse {
  return {
    account: toAccountResponse(result.account),
    firstAlias: toAliasResponse(result.firstAlias),
  };
}

export function toKeysResponse(keys: AccountKeys): KeysResponse {
  return {
    publicKey: toBase64Url(keys.publicKey),
    encryptedPrivateKey: {
      nonce: toBase64Url(keys.encryptedPrivateKey.nonce),
      ciphertext: toBase64Url(keys.encryptedPrivateKey.ciphertext),
    },
    kdf: toKdfParamsResponse(keys.kdf),
  };
}

export function toSignInResponse(outcome: SignInOutcome): SignInResponse {
  return {
    account: toAccountResponse(outcome.account),
    keys: toKeysResponse(outcome.keys),
  };
}

export function toSessionStateResponse(
  state: SessionState,
): SessionStateResponse {
  const { reauthUntil } = state.session;
  return {
    account: toAccountResponse(state.account),
    keys: toKeysResponse(state.keys),
    session: {
      id: state.session.id,
      reauthUntil: reauthUntil === null ? null : toApiInstant(reauthUntil),
    },
  };
}

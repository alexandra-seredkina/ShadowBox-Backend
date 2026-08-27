import { toApiInstant, toBase64Url } from '../../../shared/http/api-format.js';
import type { KdfParams } from '../domain/kdf-params.js';
import type { PowChallenge } from '../domain/pow-challenge.js';

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

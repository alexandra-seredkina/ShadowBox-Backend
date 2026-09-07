import { KDF_ALGORITHM, KdfParams } from '../domain/kdf-params.js';

export const KDF_FIELDS = {
  kdfAlgorithm: true,
  kdfSalt: true,
  kdfOpsLimit: true,
  kdfMemLimitBytes: true,
} as const;

export interface KdfRow {
  readonly kdfAlgorithm: string;
  readonly kdfSalt: Uint8Array;
  readonly kdfOpsLimit: number;
  readonly kdfMemLimitBytes: number;
}

export function toKdfParams(row: KdfRow): KdfParams {
  if (row.kdfAlgorithm !== KDF_ALGORITHM) {
    throw new Error(`Unsupported KDF algorithm stored: ${row.kdfAlgorithm}`);
  }
  return {
    algorithm: KDF_ALGORITHM,
    salt: row.kdfSalt,
    opsLimit: row.kdfOpsLimit,
    memLimitBytes: row.kdfMemLimitBytes,
  };
}

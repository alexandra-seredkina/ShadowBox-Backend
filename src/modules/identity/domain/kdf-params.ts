export const KDF_ALGORITHM = 'argon2id13';
export const KDF_SALT_BYTES = 16;
export const KDF_OPS_LIMIT = 3;
export const KDF_MEM_LIMIT_BYTES = 64 * 1024 * 1024;

/** Client-side Argon2id parameters that turn the password into authKey and encKey. */
export interface KdfParams {
  readonly algorithm: typeof KDF_ALGORITHM;
  readonly salt: Uint8Array;
  readonly opsLimit: number;
  readonly memLimitBytes: number;
}

/**
 * Every account uses the same cost parameters, so the only per-login value
 * is the salt and decoy answers look exactly like real ones.
 */
export function standardKdfParams(salt: Uint8Array): KdfParams {
  if (salt.length !== KDF_SALT_BYTES) {
    throw new RangeError(`KDF salt must be ${KDF_SALT_BYTES} bytes`);
  }
  return {
    algorithm: KDF_ALGORITHM,
    salt,
    opsLimit: KDF_OPS_LIMIT,
    memLimitBytes: KDF_MEM_LIMIT_BYTES,
  };
}

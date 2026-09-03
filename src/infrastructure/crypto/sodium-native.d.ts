/** Only the part of sodium-native this project calls; the package ships no types. */
declare module 'sodium-native' {
  export const crypto_pwhash_STRBYTES: number;

  export function crypto_pwhash_str_async(
    output: Buffer,
    password: Uint8Array,
    opsLimit: number,
    memLimit: number,
  ): Promise<void>;

  export function crypto_pwhash_str_verify_async(
    hash: Buffer,
    password: Uint8Array,
  ): Promise<boolean>;

  export function crypto_pwhash_str_needs_rehash(
    hash: Buffer,
    opsLimit: number,
    memLimit: number,
  ): boolean;
}

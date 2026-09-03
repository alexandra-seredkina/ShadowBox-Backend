/** Only the part of sodium-native this project calls; the package ships no types. */
declare module 'sodium-native' {
  export const crypto_pwhash_STRBYTES: number;
  export const crypto_pwhash_ALG_ARGON2ID13: number;
  export const crypto_box_PUBLICKEYBYTES: number;
  export const crypto_box_SECRETKEYBYTES: number;
  export const crypto_box_SEALBYTES: number;
  export const crypto_aead_xchacha20poly1305_ietf_KEYBYTES: number;
  export const crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;
  export const crypto_aead_xchacha20poly1305_ietf_ABYTES: number;

  export function crypto_pwhash(
    output: Uint8Array,
    password: Uint8Array,
    salt: Uint8Array,
    opsLimit: number,
    memLimit: number,
    algorithm: number,
  ): void;

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

  export function crypto_box_seed_keypair(
    publicKey: Uint8Array,
    secretKey: Uint8Array,
    seed: Uint8Array,
  ): void;

  export function crypto_box_seal(
    ciphertext: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ): void;

  /** Returns false when the ciphertext does not open with this key pair. */
  export function crypto_box_seal_open(
    message: Uint8Array,
    ciphertext: Uint8Array,
    publicKey: Uint8Array,
    secretKey: Uint8Array,
  ): boolean;

  export function crypto_aead_xchacha20poly1305_ietf_encrypt(
    ciphertext: Uint8Array,
    message: Uint8Array,
    additionalData: Uint8Array | null,
    secretNonce: null,
    nonce: Uint8Array,
    key: Uint8Array,
  ): number;

  /** Throws when the tag does not verify. */
  export function crypto_aead_xchacha20poly1305_ietf_decrypt(
    message: Uint8Array,
    secretNonce: null,
    ciphertext: Uint8Array,
    additionalData: Uint8Array | null,
    nonce: Uint8Array,
    key: Uint8Array,
  ): number;

  export function sodium_memzero(buffer: Uint8Array): void;
}

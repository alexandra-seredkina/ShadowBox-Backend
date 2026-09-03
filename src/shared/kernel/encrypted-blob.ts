export const ENCRYPTED_BLOB_VERSION = 1;
export const ENCRYPTED_BLOB_ALGORITHM = 'x25519-xchacha20poly1305';

/** API.md §1.4: content sealed for a user so that only their private key opens it. */
export interface EncryptedBlob {
  readonly v: typeof ENCRYPTED_BLOB_VERSION;
  readonly alg: typeof ENCRYPTED_BLOB_ALGORITHM;
  /** The 32-byte content key, sealed with crypto_box_seal to the user's public key. */
  readonly sealedKey: Uint8Array;
  readonly nonce: Uint8Array;
  /** XChaCha20-Poly1305 of the content under the content key, no associated data. */
  readonly ciphertext: Uint8Array;
}

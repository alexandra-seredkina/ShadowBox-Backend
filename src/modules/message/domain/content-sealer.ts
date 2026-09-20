import type { EncryptedBlob } from '../../../shared/kernel/encrypted-blob.js';

/** Encrypts for the owner's public key; the server cannot open the result. */
export abstract class ContentSealer {
  abstract seal(publicKey: Uint8Array, plaintext: Uint8Array): EncryptedBlob;
}

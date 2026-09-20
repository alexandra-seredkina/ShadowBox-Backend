import type {
  EncryptedBlob,
  EncryptedBlobJson,
} from '../kernel/encrypted-blob.js';

/** Wire formats of the API. */
export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function toEncryptedBlobJson(blob: EncryptedBlob): EncryptedBlobJson {
  return {
    v: blob.v,
    alg: blob.alg,
    sealedKey: toBase64Url(blob.sealedKey),
    nonce: toBase64Url(blob.nonce),
    ciphertext: toBase64Url(blob.ciphertext),
  };
}

export function toApiInstant(instant: Date): string {
  return instant.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Coarse timestamps are given as a UTC date only. */
export function toApiDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

import { z } from 'zod';
import {
  ENCRYPTED_BLOB_ALGORITHM,
  ENCRYPTED_BLOB_VERSION,
  EncryptedBlobJson,
} from '../kernel/encrypted-blob.js';

const SEALED_KEY_BYTES = 80;
const NONCE_BYTES = 24;
const TAG_BYTES = 16;
/** User metadata (labels, folder names) never needs more than 1 KiB of plaintext. */
export const METADATA_PLAINTEXT_MAX_BYTES = 1024;

const BASE64URL = /^[A-Za-z0-9_-]*$/;

function encodedLength(bytes: number): number {
  return Math.ceil((bytes * 4) / 3);
}

function base64UrlOfSize(min: number, max: number): z.ZodString {
  return z
    .string()
    .min(encodedLength(min))
    .max(encodedLength(max))
    .regex(BASE64URL);
}

/** An EncryptedBlob v1 with user metadata inside, kept as base64url text. */
export const metadataBlobSchema: z.ZodType<EncryptedBlobJson> = z.strictObject({
  v: z.literal(ENCRYPTED_BLOB_VERSION),
  alg: z.literal(ENCRYPTED_BLOB_ALGORITHM),
  sealedKey: base64UrlOfSize(SEALED_KEY_BYTES, SEALED_KEY_BYTES),
  nonce: base64UrlOfSize(NONCE_BYTES, NONCE_BYTES),
  ciphertext: base64UrlOfSize(
    TAG_BYTES + 1,
    METADATA_PLAINTEXT_MAX_BYTES + TAG_BYTES,
  ),
});

/** A blob the server sealed itself, such as a message preview: any content size. */
export const storedBlobSchema: z.ZodType<EncryptedBlobJson> = z.strictObject({
  v: z.literal(ENCRYPTED_BLOB_VERSION),
  alg: z.literal(ENCRYPTED_BLOB_ALGORITHM),
  sealedKey: base64UrlOfSize(SEALED_KEY_BYTES, SEALED_KEY_BYTES),
  nonce: base64UrlOfSize(NONCE_BYTES, NONCE_BYTES),
  ciphertext: z.string().min(encodedLength(TAG_BYTES)).regex(BASE64URL),
});

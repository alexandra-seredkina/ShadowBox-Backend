import { z } from 'zod';

const BASE64URL_ALPHABET = /^[A-Za-z0-9_-]*$/;

/** Base64url without padding (API.md §1.3) that decodes to exactly `byteLength` bytes. */
export function base64UrlBytes(
  byteLength: number,
): z.ZodType<Uint8Array, string> {
  return z
    .string()
    .length(Math.ceil((byteLength * 4) / 3))
    .regex(BASE64URL_ALPHABET)
    .transform((value) => Buffer.from(value, 'base64url'))
    .refine((bytes) => bytes.length === byteLength);
}

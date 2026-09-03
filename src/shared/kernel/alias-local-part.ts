import type { SecureRandom } from './secure-random.js';

export const ALIAS_LOCAL_PART_LENGTH = 10;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Largest multiple of the alphabet size that fits in a byte: bytes above it would bias the result. */
const UNBIASED_BYTE_LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

/**
 * Random `[a-z0-9]{10}` local part. Shared by registration,
 * which issues the first address, and the alias module.
 */
export function generateAliasLocalPart(random: SecureRandom): string {
  let localPart = '';
  while (localPart.length < ALIAS_LOCAL_PART_LENGTH) {
    for (const byte of random.bytes(ALIAS_LOCAL_PART_LENGTH * 2)) {
      if (
        byte < UNBIASED_BYTE_LIMIT &&
        localPart.length < ALIAS_LOCAL_PART_LENGTH
      ) {
        localPart += ALPHABET[byte % ALPHABET.length] ?? '';
      }
    }
  }
  return localPart;
}

import { Injectable } from '@nestjs/common';
import sodium from 'sodium-native';
import { AuthKeyHasher } from '../domain/auth-key-hasher.js';

/** Never below 64 MiB and 3 passes. */
export const AUTH_KEY_HASH_OPS_LIMIT = 3;
export const AUTH_KEY_HASH_MEM_LIMIT_BYTES = 64 * 1024 * 1024;

/** libsodium works with NUL-padded fixed-size buffers; the database keeps the trimmed string. */
function toHashBuffer(hash: string): Buffer | null {
  const encoded = Buffer.from(hash, 'utf8');
  if (encoded.length >= sodium.crypto_pwhash_STRBYTES) {
    return null;
  }
  const buffer = Buffer.alloc(sodium.crypto_pwhash_STRBYTES);
  encoded.copy(buffer);
  return buffer;
}

@Injectable()
export class SodiumAuthKeyHasher implements AuthKeyHasher {
  async hash(authKey: Uint8Array): Promise<string> {
    const output = Buffer.alloc(sodium.crypto_pwhash_STRBYTES);
    await sodium.crypto_pwhash_str_async(
      output,
      authKey,
      AUTH_KEY_HASH_OPS_LIMIT,
      AUTH_KEY_HASH_MEM_LIMIT_BYTES,
    );
    return output.toString('utf8').replace(/\0+$/, '');
  }

  async verify(hash: string, authKey: Uint8Array): Promise<boolean> {
    const buffer = toHashBuffer(hash);
    if (buffer === null) {
      return false;
    }
    return sodium.crypto_pwhash_str_verify_async(buffer, authKey);
  }

  needsRehash(hash: string): boolean {
    const buffer = toHashBuffer(hash);
    return (
      buffer === null ||
      sodium.crypto_pwhash_str_needs_rehash(
        buffer,
        AUTH_KEY_HASH_OPS_LIMIT,
        AUTH_KEY_HASH_MEM_LIMIT_BYTES,
      )
    );
  }
}

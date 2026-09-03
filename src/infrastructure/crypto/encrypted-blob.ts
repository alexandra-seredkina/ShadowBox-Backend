import sodium from 'sodium-native';
import {
  ENCRYPTED_BLOB_ALGORITHM,
  ENCRYPTED_BLOB_VERSION,
  EncryptedBlob,
} from '../../shared/kernel/encrypted-blob.js';
import type { SecureRandom } from '../../shared/kernel/secure-random.js';

/**
 * Seals content for its owner. The server can produce a blob but never open
 * it again: the content key is wiped once it is sealed.
 */
export function sealEncryptedBlob(params: {
  readonly publicKey: Uint8Array;
  readonly plaintext: Uint8Array;
  readonly random: SecureRandom;
}): EncryptedBlob {
  if (params.publicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) {
    throw new RangeError('Public key must be 32 bytes');
  }
  const contentKey = params.random.bytes(
    sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
  );
  const nonce = params.random.bytes(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );
  try {
    const ciphertext = new Uint8Array(
      params.plaintext.length +
        sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES,
    );
    sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      ciphertext,
      params.plaintext,
      null,
      null,
      nonce,
      contentKey,
    );
    const sealedKey = new Uint8Array(
      contentKey.length + sodium.crypto_box_SEALBYTES,
    );
    sodium.crypto_box_seal(sealedKey, contentKey, params.publicKey);
    return {
      v: ENCRYPTED_BLOB_VERSION,
      alg: ENCRYPTED_BLOB_ALGORITHM,
      sealedKey,
      nonce,
      ciphertext,
    };
  } finally {
    sodium.sodium_memzero(contentKey);
  }
}

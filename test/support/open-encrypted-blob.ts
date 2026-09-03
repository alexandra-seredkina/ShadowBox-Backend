import sodium from 'sodium-native';
import type { EncryptedBlob } from '../../src/shared/kernel/encrypted-blob.js';

/** What the browser does; the server never holds a private key. */
export function openEncryptedBlob(
  blob: EncryptedBlob,
  keyPair: { readonly publicKey: Uint8Array; readonly secretKey: Uint8Array },
): Uint8Array {
  const contentKey = new Uint8Array(
    blob.sealedKey.length - sodium.crypto_box_SEALBYTES,
  );
  if (
    !sodium.crypto_box_seal_open(
      contentKey,
      blob.sealedKey,
      keyPair.publicKey,
      keyPair.secretKey,
    )
  ) {
    throw new Error('Sealed key does not open with this key pair');
  }
  const plaintext = new Uint8Array(
    blob.ciphertext.length - sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES,
  );
  sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    plaintext,
    null,
    blob.ciphertext,
    null,
    blob.nonce,
    contentKey,
  );
  return plaintext;
}

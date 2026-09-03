import type { Brand } from '../../../shared/kernel/brand.js';
import type { KdfParams } from './kdf-params.js';
import type { Login } from './login.js';

export type AccountId = Brand<string, 'AccountId'>;

export const AUTH_KEY_BYTES = 32;
export const PUBLIC_KEY_BYTES = 32;
export const PRIVATE_KEY_NONCE_BYTES = 24;
/** X25519 secret key (32 bytes) plus the Poly1305 tag (16 bytes). */
export const PRIVATE_KEY_CIPHERTEXT_BYTES = 48;

/** The X25519 private key encrypted on the client with XChaCha20-Poly1305. */
export interface EncryptedPrivateKey {
  readonly nonce: Uint8Array;
  readonly ciphertext: Uint8Array;
}

/** What the client needs to unlock the mailbox; the server cannot read any of it. */
export interface AccountKeys {
  readonly publicKey: Uint8Array;
  readonly encryptedPrivateKey: EncryptedPrivateKey;
  readonly kdf: KdfParams;
}

export interface AccountSummary {
  readonly id: AccountId;
  readonly login: Login;
  readonly createdAt: Date;
  readonly isIpBindingEnabled: boolean;
  readonly activeAliases: number;
}

export interface AccountCredentials {
  readonly id: AccountId;
  /** Argon2id of authKey, encoded together with its parameters. */
  readonly authKeyHash: string;
  readonly isIpBindingEnabled: boolean;
}

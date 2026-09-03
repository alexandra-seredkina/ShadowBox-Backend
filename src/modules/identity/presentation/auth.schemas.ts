import { z } from 'zod';
import { base64UrlBytes } from '../../../shared/http/base64url.schema.js';
import {
  AUTH_KEY_BYTES,
  PRIVATE_KEY_CIPHERTEXT_BYTES,
  PRIVATE_KEY_NONCE_BYTES,
  PUBLIC_KEY_BYTES,
} from '../domain/account.js';
import {
  KDF_ALGORITHM,
  KDF_MEM_LIMIT_BYTES,
  KDF_OPS_LIMIT,
  KDF_SALT_BYTES,
} from '../domain/kdf-params.js';
import { POW_PURPOSES } from '../domain/pow-challenge.js';

/** Generous outer bound: the exact login rules run after NFKC in the domain. */
const RAW_LOGIN_MAX_LENGTH = 128;
/** Longest canonical uint64 in decimal; the domain checks the value itself. */
const POW_NONCE_MAX_LENGTH = 20;

const rawLoginSchema = z.string().max(RAW_LOGIN_MAX_LENGTH);

export const powRequestSchema = z.strictObject({
  purpose: z.enum(POW_PURPOSES),
});
export type PowRequest = z.infer<typeof powRequestSchema>;

export const preloginRequestSchema = z.strictObject({
  login: rawLoginSchema,
});
export type PreloginRequest = z.infer<typeof preloginRequestSchema>;

const encryptedPrivateKeySchema = z.strictObject({
  nonce: base64UrlBytes(PRIVATE_KEY_NONCE_BYTES),
  ciphertext: base64UrlBytes(PRIVATE_KEY_CIPHERTEXT_BYTES),
});

const powSolutionSchema = z.strictObject({
  challengeId: z.uuid(),
  nonce: z.string().min(1).max(POW_NONCE_MAX_LENGTH),
});

/** Only the shared cost parameters are accepted, see /auth/prelogin. */
const kdfSchema = z.strictObject({
  algorithm: z.literal(KDF_ALGORITHM),
  salt: base64UrlBytes(KDF_SALT_BYTES),
  opsLimit: z.literal(KDF_OPS_LIMIT),
  memLimitBytes: z.literal(KDF_MEM_LIMIT_BYTES),
});

export const registerRequestSchema = z.strictObject({
  login: rawLoginSchema,
  authKey: base64UrlBytes(AUTH_KEY_BYTES),
  kdf: kdfSchema,
  keys: z.strictObject({
    publicKey: base64UrlBytes(PUBLIC_KEY_BYTES),
    encryptedPrivateKey: encryptedPrivateKeySchema,
    recoveryEncryptedPrivateKey: encryptedPrivateKeySchema,
  }),
  pow: powSolutionSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

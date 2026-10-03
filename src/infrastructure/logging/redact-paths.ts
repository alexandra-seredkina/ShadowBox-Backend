/**
 * Anything listed here is replaced before a log line is written.
 * A new sensitive field gets added in the same change that introduces it.
 */
export const REDACT_PATHS: readonly string[] = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  ...[
    'password',
    'authKey',
    'token',
    'sessionToken',
    'cookie',
    'recoveryPhrase',
    'privateKey',
    'encryptedPrivateKey',
    'recoveryEncryptedPrivateKey',
    'sealedKey',
    'ciphertext',
    'ip',
    'address',
  ].flatMap((field) => [field, `*.${field}`]),
];

import { isIP } from 'node:net';
import { z } from 'zod';

const DEFAULT_PORT = 3000;

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const originSchema = z
  .url({ protocol: /^https?$/ })
  .transform((value) => new URL(value).origin);

/** Comma-separated list of web origins allowed to send mutating requests. */
const originListSchema = z
  .string()
  .transform((value) => value.split(',').map((origin) => origin.trim()))
  .pipe(z.array(originSchema).min(1));

const MIN_SECRET_KEY_BYTES = 32;

/** base64url without padding, at least 256 bits once decoded. */
const secretKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .transform((value) => Buffer.from(value, 'base64url'))
  .refine((key) => key.length >= MIN_SECRET_KEY_BYTES);

/** Lower-case DNS name, e.g. shadowbox.test. */
const domainSchema = z
  .string()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);

/**
 * Addresses of the reverse proxies whose X-Forwarded-For is believed, e.g.
 * the nginx container. Empty: the socket address is the client.
 */
const proxyListSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((address) => address.trim())
      .filter((address) => address !== ''),
  )
  .pipe(z.array(z.string().refine((address) => isIP(address) !== 0)))
  .default([]);

export const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_PORT),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  ALLOWED_ORIGINS: originListSchema,
  PRELOGIN_SALT_KEY: secretKeySchema,
  POW_DIFFICULTY: z.coerce.number().int().min(1).max(32).default(20),
  MAIL_DOMAIN: domainSchema,
  IP_HASH_KEY: secretKeySchema,
  IP_HASH_KEY_VERSION: z.coerce.number().int().min(1).max(32_767).default(1),
  /** The key of version IP_HASH_KEY_VERSION - 1, kept for one rotation. */
  IP_HASH_PREVIOUS_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    secretKeySchema.optional(),
  ),
  TRUSTED_PROXIES: proxyListSchema,
});

export type Env = z.infer<typeof envSchema>;

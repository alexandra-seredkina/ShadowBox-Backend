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

export const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_PORT),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  ALLOWED_ORIGINS: originListSchema,
});

export type Env = z.infer<typeof envSchema>;

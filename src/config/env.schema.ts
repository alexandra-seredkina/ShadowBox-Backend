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

export const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_PORT),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export type Env = z.infer<typeof envSchema>;

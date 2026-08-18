import { z } from 'zod';

const DEFAULT_PORT = 3000;

export const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_PORT),
});

export type Env = z.infer<typeof envSchema>;

import { envSchema } from './env.schema.js';

export class ConfigValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid environment: ${issues.join('; ')}`);
    this.name = 'ConfigValidationError';
  }
}

export class AppConfig {
  constructor(
    readonly port: number,
    readonly databaseUrl: string,
  ) {}
}

/**
 * Error messages name the variable and the failed check only:
 * values may be secrets and must not reach the logs.
 */
export function loadConfig(
  source: Readonly<Record<string, string | undefined>>,
): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigValidationError(
      result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.code}`,
      ),
    );
  }
  return new AppConfig(result.data.PORT, result.data.DATABASE_URL);
}

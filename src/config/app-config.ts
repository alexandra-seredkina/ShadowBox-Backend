import { envSchema, LogLevel } from './env.schema.js';

export class ConfigValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid environment: ${issues.join('; ')}`);
    this.name = 'ConfigValidationError';
  }
}

export interface AppConfigValues {
  readonly port: number;
  readonly databaseUrl: string;
  readonly logLevel: LogLevel;
  readonly allowedOrigins: readonly string[];
  /** HMAC key for decoy KDF salts. Never rotated: see DecoySaltSource. */
  readonly preloginSaltKey: Uint8Array;
  readonly powDifficulty: number;
}

export class AppConfig implements AppConfigValues {
  readonly port: number;
  readonly databaseUrl: string;
  readonly logLevel: LogLevel;
  readonly allowedOrigins: readonly string[];
  readonly preloginSaltKey: Uint8Array;
  readonly powDifficulty: number;

  constructor(values: AppConfigValues) {
    this.port = values.port;
    this.databaseUrl = values.databaseUrl;
    this.logLevel = values.logLevel;
    this.allowedOrigins = values.allowedOrigins;
    this.preloginSaltKey = values.preloginSaltKey;
    this.powDifficulty = values.powDifficulty;
  }
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
  return new AppConfig({
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    logLevel: result.data.LOG_LEVEL,
    allowedOrigins: result.data.ALLOWED_ORIGINS,
    preloginSaltKey: result.data.PRELOGIN_SALT_KEY,
    powDifficulty: result.data.POW_DIFFICULTY,
  });
}

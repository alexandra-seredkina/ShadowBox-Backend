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
  readonly mailDomain: string;
  /** HMAC key for client IPs; the version is stored next to every hash. */
  readonly ipHashKey: Uint8Array;
  readonly ipHashKeyVersion: number;
  /** Version ipHashKeyVersion - 1; null when no rotation is in progress. */
  readonly ipHashPreviousKey: Uint8Array | null;
  /** HMAC key for senders an account has had mail from; the version is stored next to every hash. */
  readonly senderHashKey: Uint8Array;
  readonly senderHashKeyVersion: number;
  readonly trustedProxies: readonly string[];
  readonly lmtpHost: string;
  readonly lmtpPort: number;
  readonly registerRateLimitPerHour: number;
}

export class AppConfig implements AppConfigValues {
  readonly port: number;
  readonly databaseUrl: string;
  readonly logLevel: LogLevel;
  readonly allowedOrigins: readonly string[];
  readonly preloginSaltKey: Uint8Array;
  readonly powDifficulty: number;
  readonly mailDomain: string;
  readonly ipHashKey: Uint8Array;
  readonly ipHashKeyVersion: number;
  readonly ipHashPreviousKey: Uint8Array | null;
  readonly senderHashKey: Uint8Array;
  readonly senderHashKeyVersion: number;
  readonly trustedProxies: readonly string[];
  readonly lmtpHost: string;
  readonly lmtpPort: number;
  readonly registerRateLimitPerHour: number;

  constructor(values: AppConfigValues) {
    this.port = values.port;
    this.databaseUrl = values.databaseUrl;
    this.logLevel = values.logLevel;
    this.allowedOrigins = values.allowedOrigins;
    this.preloginSaltKey = values.preloginSaltKey;
    this.powDifficulty = values.powDifficulty;
    this.mailDomain = values.mailDomain;
    this.ipHashKey = values.ipHashKey;
    this.ipHashKeyVersion = values.ipHashKeyVersion;
    this.ipHashPreviousKey = values.ipHashPreviousKey;
    this.senderHashKey = values.senderHashKey;
    this.senderHashKeyVersion = values.senderHashKeyVersion;
    this.trustedProxies = values.trustedProxies;
    this.lmtpHost = values.lmtpHost;
    this.lmtpPort = values.lmtpPort;
    this.registerRateLimitPerHour = values.registerRateLimitPerHour;
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
    mailDomain: result.data.MAIL_DOMAIN,
    ipHashKey: result.data.IP_HASH_KEY,
    ipHashKeyVersion: result.data.IP_HASH_KEY_VERSION,
    ipHashPreviousKey: result.data.IP_HASH_PREVIOUS_KEY ?? null,
    senderHashKey: result.data.SENDER_HASH_KEY,
    senderHashKeyVersion: result.data.SENDER_HASH_KEY_VERSION,
    trustedProxies: result.data.TRUSTED_PROXIES,
    lmtpHost: result.data.LMTP_HOST,
    lmtpPort: result.data.LMTP_PORT,
    registerRateLimitPerHour: result.data.REGISTER_RATE_LIMIT_PER_HOUR,
  });
}

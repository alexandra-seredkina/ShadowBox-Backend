import { AppConfig, AppConfigValues } from '../../src/config/app-config.js';

export const TEST_ALLOWED_ORIGIN = 'http://localhost:8080';

export function createTestConfig(
  overrides: Partial<AppConfigValues> = {},
): AppConfig {
  return new AppConfig({
    port: 3000,
    databaseUrl: 'postgresql://test@localhost/test',
    logLevel: 'silent',
    allowedOrigins: [TEST_ALLOWED_ORIGIN],
    preloginSaltKey: new Uint8Array(32).fill(42),
    powDifficulty: 8,
    mailDomain: 'shadowbox.test',
    ipHashKey: new Uint8Array(32).fill(43),
    ipHashKeyVersion: 1,
    ...overrides,
  });
}

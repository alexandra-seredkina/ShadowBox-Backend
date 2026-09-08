import { VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppConfig } from './config/app-config.js';

export const API_PREFIX = 'api';
export const API_DEFAULT_VERSION = '1';
export const MAX_JSON_BODY = '64kb';

/**
 * Shared by main.ts and the e2e tests so both run the same HTTP pipeline.
 * The app must be created with `bodyParser: false`: only JSON is accepted.
 */
export function configureApp(app: NestExpressApplication): void {
  const { trustedProxies } = app.get(AppConfig);
  // Only the listed proxies may set X-Forwarded-For; anyone else is the client.
  app.set(
    'trust proxy',
    trustedProxies.length > 0 ? [...trustedProxies] : false,
  );
  app.use(helmet());
  app.useBodyParser('json', { limit: MAX_JSON_BODY });
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_DEFAULT_VERSION,
  });
  app.enableShutdownHooks();
}

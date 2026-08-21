import { VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

export const API_PREFIX = 'api';
export const API_DEFAULT_VERSION = '1';
export const MAX_JSON_BODY = '64kb';

/**
 * Shared by main.ts and the e2e tests so both run the same HTTP pipeline.
 * The app must be created with `bodyParser: false`: only JSON is accepted.
 */
export function configureApp(app: NestExpressApplication): void {
  app.use(helmet());
  app.useBodyParser('json', { limit: MAX_JSON_BODY });
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_DEFAULT_VERSION,
  });
  app.enableShutdownHooks();
}

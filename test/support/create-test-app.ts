import { Type } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { configureApp } from '../../src/app.setup.js';
import { AppConfig, AppConfigValues } from '../../src/config/app-config.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { AttemptCounter } from '../../src/shared/kernel/attempt-counter.js';
import { InMemoryAttemptCounter } from './kernel-fakes.js';
import { createTestConfig } from './test-config.js';

export interface ProviderOverride {
  readonly provide:
    Type | symbol | string | (abstract new (...args: never[]) => unknown);
  readonly useValue: unknown;
}

export interface TestAppOptions {
  readonly rootModule: Type;
  readonly prisma?: unknown;
  readonly overrides?: readonly ProviderOverride[];
  readonly config?: Partial<AppConfigValues>;
  /** Keep the PostgreSQL attempt counters; only with a real database in `prisma`. */
  readonly useDatabaseCounters?: boolean;
}

/**
 * Boots the real HTTP pipeline with test config. Attempt counters live in
 * memory unless the test runs on a database and asks for the real ones.
 */
export async function createTestApp(
  options: TestAppOptions,
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [options.rootModule] })
    .overrideProvider(AppConfig)
    .useValue(createTestConfig(options.config))
    .overrideProvider(PrismaService)
    .useValue(options.prisma ?? {});
  if (options.useDatabaseCounters !== true) {
    builder = builder
      .overrideProvider(AttemptCounter)
      .useValue(new InMemoryAttemptCounter());
  }
  for (const override of options.overrides ?? []) {
    builder = builder
      .overrideProvider(override.provide)
      .useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureApp(app);
  await app.init();
  return app;
}

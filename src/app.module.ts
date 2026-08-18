import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from './config/config.module.js';
import { HealthController } from './health/health.controller.js';
import { LoggingModule } from './infrastructure/logging/logging.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ApiExceptionFilter } from './shared/errors/api-exception.filter.js';

@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}

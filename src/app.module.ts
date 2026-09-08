import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config/config.module.js';
import { HealthController } from './health/health.controller.js';
import { ClockModule } from './infrastructure/clock/clock.module.js';
import { CryptoModule } from './infrastructure/crypto/crypto.module.js';
import { OriginGuard } from './infrastructure/http/origin.guard.js';
import { RateLimitGuard } from './infrastructure/http/rate-limit.guard.js';
import { LoggingModule } from './infrastructure/logging/logging.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { AliasModule } from './modules/alias/alias.module.js';
import { DeliveryModule } from './modules/delivery/delivery.module.js';
import { FolderModule } from './modules/folder/folder.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { MessageModule } from './modules/message/message.module.js';
import { ThreatModule } from './modules/threat/threat.module.js';
import { ApiExceptionFilter } from './shared/errors/api-exception.filter.js';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PrismaModule,
    ClockModule,
    CryptoModule,
    IdentityModule,
    AliasModule,
    FolderModule,
    MessageModule,
    ThreatModule,
    DeliveryModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}

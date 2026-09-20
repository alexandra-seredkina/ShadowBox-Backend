import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { ClockModule } from './infrastructure/clock/clock.module.js';
import { CryptoModule } from './infrastructure/crypto/crypto.module.js';
import { LoggingModule } from './infrastructure/logging/logging.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { DeliveryModule } from './modules/delivery/delivery.module.js';

/** The mail intake process: no HTTP, only LMTP from the MTA. */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PrismaModule,
    ClockModule,
    CryptoModule,
    DeliveryModule,
  ],
})
export class DeliveryProcessModule {}

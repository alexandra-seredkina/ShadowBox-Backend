import { Global, Module } from '@nestjs/common';
import { AttemptCounter } from '../../shared/kernel/attempt-counter.js';
import { IdempotencyRepository } from '../../shared/kernel/idempotency.js';
import { PrismaAttemptCounter } from './prisma-attempt-counter.js';
import { PrismaIdempotencyRepository } from './prisma-idempotency.repository.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: IdempotencyRepository, useClass: PrismaIdempotencyRepository },
    { provide: AttemptCounter, useClass: PrismaAttemptCounter },
  ],
  exports: [PrismaService, IdempotencyRepository, AttemptCounter],
})
export class PrismaModule {}

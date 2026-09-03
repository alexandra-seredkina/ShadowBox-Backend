import { Global, Module } from '@nestjs/common';
import { IdempotencyRepository } from '../../shared/kernel/idempotency.js';
import { PrismaIdempotencyRepository } from './prisma-idempotency.repository.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: IdempotencyRepository, useClass: PrismaIdempotencyRepository },
  ],
  exports: [PrismaService, IdempotencyRepository],
})
export class PrismaModule {}

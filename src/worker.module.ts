import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { ClockModule } from './infrastructure/clock/clock.module.js';
import { CryptoModule } from './infrastructure/crypto/crypto.module.js';
import { JobRunner } from './infrastructure/jobs/job-runner.js';
import { PostgresJobLock } from './infrastructure/jobs/postgres-job-lock.js';
import { LoggingModule } from './infrastructure/logging/logging.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { ExpireTemporaryAliasesJob } from './modules/alias/application/expire-temporary-aliases.job.js';
import { AliasModule } from './modules/alias/alias.module.js';
import { JobLock, SCHEDULED_JOBS } from './shared/kernel/scheduled-job.js';

/** The background process: no HTTP, only scheduled jobs. */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PrismaModule,
    ClockModule,
    CryptoModule,
    AliasModule,
  ],
  providers: [
    JobRunner,
    { provide: JobLock, useClass: PostgresJobLock },
    {
      provide: SCHEDULED_JOBS,
      useFactory: (expireAliases: ExpireTemporaryAliasesJob) => [expireAliases],
      inject: [ExpireTemporaryAliasesJob],
    },
  ],
})
export class WorkerModule {}

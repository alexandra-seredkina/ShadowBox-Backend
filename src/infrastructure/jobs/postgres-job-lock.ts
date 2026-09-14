import { Injectable } from '@nestjs/common';
import { JobLock } from '../../shared/kernel/scheduled-job.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** A run longer than this is a bug; the transaction holding the lock is cut off. */
const MAX_RUN_MS = 5 * 60 * 1000;

/**
 * Transaction-level advisory lock: it is released on commit, rollback or a
 * dropped connection, so a crashed worker never leaves a job locked.
 */
@Injectable()
export class PostgresJobLock implements JobLock {
  constructor(private readonly prisma: PrismaService) {}

  async runExclusive<T>(
    name: string,
    work: () => Promise<T>,
  ): Promise<T | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${name})) AS locked`;
        return row?.locked === true ? work() : null;
      },
      { timeout: MAX_RUN_MS, maxWait: MAX_RUN_MS },
    );
  }
}

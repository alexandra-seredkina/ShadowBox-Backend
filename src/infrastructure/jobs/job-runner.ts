import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Clock } from '../../shared/kernel/clock.js';
import {
  JobLock,
  SCHEDULED_JOBS,
  ScheduledJob,
} from '../../shared/kernel/scheduled-job.js';

/**
 * The worker's scheduler. Each job is re-armed with setTimeout after its run
 * finishes, so runs of one job never overlap inside a process; the lock keeps
 * them from overlapping across processes.
 */
@Injectable()
export class JobRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private isStopped = false;

  constructor(
    @Inject(SCHEDULED_JOBS) private readonly jobs: readonly ScheduledJob[],
    private readonly lock: JobLock,
    private readonly clock: Clock,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(JobRunner.name);
  }

  onApplicationBootstrap(): void {
    for (const job of this.jobs) {
      this.arm(job, 0);
    }
  }

  onModuleDestroy(): void {
    this.isStopped = true;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /** One run of one job; failures are logged and the job keeps its schedule. */
  async runOnce(job: ScheduledJob): Promise<void> {
    try {
      const changed = await this.lock.runExclusive(job.name, () =>
        job.run(this.clock.now()),
      );
      if (changed !== null && changed > 0) {
        this.logger.info({ job: job.name, changed }, 'Job run finished');
      }
    } catch (error) {
      this.logger.error({ job: job.name, err: error }, 'Job run failed');
    }
  }

  private arm(job: ScheduledJob, delayMs: number): void {
    if (this.isStopped) {
      return;
    }
    const timer = setTimeout(() => {
      void this.runOnce(job).finally(() => this.arm(job, job.intervalMs));
    }, delayMs);
    this.timers.set(job.name, timer);
  }
}

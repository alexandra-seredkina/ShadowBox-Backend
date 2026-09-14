import type { PinoLogger } from 'nestjs-pino';
import { FixedClock } from '../../../test/support/kernel-fakes.js';
import { JobLock, ScheduledJob } from '../../shared/kernel/scheduled-job.js';
import { JobRunner } from './job-runner.js';

const NOW = new Date('2020-01-15T12:00:00Z');

class OpenLock implements JobLock {
  isFree = true;

  async runExclusive<T>(_: string, work: () => Promise<T>): Promise<T | null> {
    return this.isFree ? work() : null;
  }
}

function jobThat(run: (now: Date) => Promise<number>): ScheduledJob & {
  runs: Date[];
} {
  const runs: Date[] = [];
  return {
    name: 'test.job',
    intervalMs: 60_000,
    runs,
    run: (now) => {
      runs.push(now);
      return run(now);
    },
  };
}

describe('JobRunner', () => {
  const logger = { setContext: vi.fn(), info: vi.fn(), error: vi.fn() };
  let lock: OpenLock;

  function runner(job: ScheduledJob): JobRunner {
    return new JobRunner(
      [job],
      lock,
      new FixedClock(NOW),
      logger as unknown as PinoLogger,
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    lock = new OpenLock();
    logger.info.mockReset();
    logger.error.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a job at start and then on its interval', async () => {
    const job = jobThat(() => Promise.resolve(0));
    const scheduler = runner(job);

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    scheduler.onModuleDestroy();

    expect(job.runs).toEqual([NOW, NOW]);
  });

  it('logs how much a run changed, and nothing for an idle run', async () => {
    await runner(jobThat(() => Promise.resolve(0))).runOnce(
      jobThat(() => Promise.resolve(0)),
    );
    const busy = jobThat(() => Promise.resolve(3));
    await runner(busy).runOnce(busy);

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      { job: 'test.job', changed: 3 },
      'Job run finished',
    );
  });

  it('skips a run while another process holds the lock', async () => {
    lock.isFree = false;
    const job = jobThat(() => Promise.resolve(1));

    await runner(job).runOnce(job);

    expect(job.runs).toEqual([]);
  });

  it('keeps the schedule after a failed run', async () => {
    const job = jobThat(() => Promise.reject(new Error('db down')));
    const scheduler = runner(job);

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    scheduler.onModuleDestroy();

    expect(job.runs).toHaveLength(2);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('stops scheduling once the module is destroyed', async () => {
    const job = jobThat(() => Promise.resolve(0));
    const scheduler = runner(job);

    scheduler.onApplicationBootstrap();
    scheduler.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(job.runs).toEqual([]);
  });
});

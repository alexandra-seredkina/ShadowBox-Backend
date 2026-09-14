/**
 * Periodic work that runs in the worker process, never in the API. Runs must
 * be idempotent: a run may repeat after a crash or overlap a slow one elsewhere.
 */
export interface ScheduledJob {
  /** Stable name; also the key of the lock that keeps one run at a time. */
  readonly name: string;
  readonly intervalMs: number;
  /** @returns how many records the run changed, for the log. */
  run(now: Date): Promise<number>;
}

/** All jobs the worker schedules. */
export const SCHEDULED_JOBS = Symbol('SCHEDULED_JOBS');

/** Lets only one worker instance run a given job at a time. */
export abstract class JobLock {
  /** Runs `work` when the lock is free; returns null without running it otherwise. */
  abstract runExclusive<T>(
    name: string,
    work: () => Promise<T>,
  ): Promise<T | null>;
}

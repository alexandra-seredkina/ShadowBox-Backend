/** What is counted and for whom, e.g. failed sign-ins for one login. */
export interface CounterKey {
  readonly scope: string;
  readonly subject: string;
}

export interface AttemptWindow {
  readonly count: number;
  /** End of the current window; null when nothing has been counted yet. */
  readonly resetsAt: Date | null;
}

/**
 * Fixed-window counters. Subjects are stored only as an HMAC, so a dump does
 * not reveal which logins or addresses were counted.
 */
export abstract class AttemptCounter {
  abstract peek(key: CounterKey, now: Date): Promise<AttemptWindow>;

  /** Adds one attempt, starting a new window of `windowMs` if the last one ended. */
  abstract increment(
    key: CounterKey,
    windowMs: number,
    now: Date,
  ): Promise<AttemptWindow>;

  abstract reset(key: CounterKey): Promise<void>;
}

export function secondsUntil(resetsAt: Date | null, now: Date): number {
  if (resetsAt === null) {
    return 0;
  }
  return Math.max(1, Math.ceil((resetsAt.getTime() - now.getTime()) / 1000));
}

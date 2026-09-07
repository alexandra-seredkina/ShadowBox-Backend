import { Clock } from '../../src/shared/kernel/clock.js';
import {
  AttemptCounter,
  AttemptWindow,
  CounterKey,
} from '../../src/shared/kernel/attempt-counter.js';
import { IpHash, IpHasher } from '../../src/shared/kernel/ip-hasher.js';
import { SecureRandom } from '../../src/shared/kernel/secure-random.js';

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceBy(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

/** Each call returns a different, predictable byte pattern. */
export class SequentialRandom implements SecureRandom {
  private calls = 0;

  bytes(length: number): Uint8Array {
    this.calls += 1;
    return new Uint8Array(length).fill(this.calls);
  }
}

/** Keeps the address readable in assertions instead of hashing it. */
export class PlainIpHasher implements IpHasher {
  hash(ip: string): IpHash {
    return { hash: Buffer.from(ip, 'utf8'), keyVersion: 1 };
  }

  matches(ip: string, stored: IpHash): boolean {
    return Buffer.from(stored.hash).toString('utf8') === ip;
  }
}

export class InMemoryAttemptCounter implements AttemptCounter {
  private readonly windows = new Map<
    string,
    { count: number; resetsAt: Date }
  >();

  peek(key: CounterKey, now: Date): Promise<AttemptWindow> {
    const window = this.windows.get(this.id(key));
    return Promise.resolve(
      window === undefined || window.resetsAt <= now
        ? { count: 0, resetsAt: null }
        : { ...window },
    );
  }

  increment(
    key: CounterKey,
    windowMs: number,
    now: Date,
  ): Promise<AttemptWindow> {
    const id = this.id(key);
    const current = this.windows.get(id);
    const next =
      current === undefined || current.resetsAt <= now
        ? { count: 1, resetsAt: new Date(now.getTime() + windowMs) }
        : { count: current.count + 1, resetsAt: current.resetsAt };
    this.windows.set(id, next);
    return Promise.resolve({ ...next });
  }

  reset(key: CounterKey): Promise<void> {
    this.windows.delete(this.id(key));
    return Promise.resolve();
  }

  private id(key: CounterKey): string {
    return `${key.scope}\0${key.subject}`;
  }
}

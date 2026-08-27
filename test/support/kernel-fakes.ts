import { Clock } from '../../src/shared/kernel/clock.js';
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

import { DomainError } from './domain-error.js';

export class RateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED';
  readonly kind = 'rate_limited';

  constructor(override readonly retryAfterSeconds: number) {
    super('Too many requests');
  }
}

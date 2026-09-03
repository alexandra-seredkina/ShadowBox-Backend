import { DomainError } from './domain-error.js';

export class IdempotencyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_CONFLICT';
  readonly kind = 'conflict';

  constructor() {
    super('Idempotency key was used with a different request');
  }
}

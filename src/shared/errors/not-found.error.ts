import { DomainError } from './domain-error.js';

/** Missing and someone else's look the same, so existence never leaks. */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly kind = 'not_found';

  constructor() {
    super('Not found');
  }
}

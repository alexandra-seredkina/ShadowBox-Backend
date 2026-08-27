import { DomainError } from './domain-error.js';

export interface ValidationIssue {
  readonly path: string;
  readonly issue: string;
}

export class ValidationFailedError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly kind = 'invalid_input';

  constructor(readonly details: readonly ValidationIssue[]) {
    super('Request validation failed');
  }
}

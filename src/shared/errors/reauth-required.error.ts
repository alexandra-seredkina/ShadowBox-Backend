import { DomainError } from './domain-error.js';

export class ReauthRequiredError extends DomainError {
  readonly code = 'REAUTH_REQUIRED';
  readonly kind = 'forbidden';

  constructor() {
    super('Confirm the password again to do this');
  }
}

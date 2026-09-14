import { DomainError } from '../../../shared/errors/domain-error.js';

export class LoginTakenError extends DomainError {
  readonly code = 'LOGIN_TAKEN';
  readonly kind = 'conflict';

  constructor() {
    super('Login is already taken');
  }
}

export class LoginReservedError extends DomainError {
  readonly code = 'LOGIN_RESERVED';
  readonly kind = 'rule_violation';

  constructor() {
    super('Login is reserved');
  }
}

export class PowInvalidError extends DomainError {
  readonly code = 'POW_INVALID';
  readonly kind = 'invalid_input';

  constructor() {
    super('Proof-of-work solution is invalid or expired');
  }
}

/** One answer for an unknown login and a wrong key alike. */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly kind = 'unauthenticated';

  constructor() {
    super('Invalid login or key');
  }
}

export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
  readonly kind = 'unauthenticated';

  constructor() {
    super('Not authenticated');
  }
}

export class PowRequiredError extends DomainError {
  readonly code = 'POW_REQUIRED';
  readonly kind = 'precondition_required';

  constructor() {
    super('Too many failed attempts: solve a proof-of-work challenge');
  }
}

export class AccountLockedError extends DomainError {
  readonly code = 'ACCOUNT_LOCKED';
  readonly kind = 'locked';

  constructor(override readonly retryAfterSeconds: number) {
    super('Sign-in is temporarily locked');
  }
}

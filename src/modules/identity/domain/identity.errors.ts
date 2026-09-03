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

/** Raised by the registrar when the generated alias already exists; the caller retries. */
export class AliasAddressTakenError extends Error {
  constructor() {
    super('Generated alias address is already taken');
    this.name = 'AliasAddressTakenError';
  }
}

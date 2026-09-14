import { DomainError } from '../../../shared/errors/domain-error.js';

export class AliasLimitExceededError extends DomainError {
  readonly code = 'ALIAS_LIMIT_EXCEEDED';
  readonly kind = 'rule_violation';

  constructor() {
    super('Active alias limit reached');
  }
}

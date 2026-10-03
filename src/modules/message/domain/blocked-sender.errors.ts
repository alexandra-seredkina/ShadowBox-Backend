import { DomainError } from '../../../shared/errors/domain-error.js';

export class BlockLimitExceededError extends DomainError {
  readonly code = 'BLOCK_LIMIT_EXCEEDED';
  readonly kind = 'rule_violation';

  constructor() {
    super('Blocked sender limit reached');
  }
}

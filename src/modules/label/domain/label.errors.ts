import { DomainError } from '../../../shared/errors/domain-error.js';

export class LabelLimitExceededError extends DomainError {
  readonly code = 'LABEL_LIMIT_EXCEEDED';
  readonly kind = 'rule_violation';

  constructor() {
    super('Label limit reached');
  }
}

import { DomainError } from '../../../shared/errors/domain-error.js';

export class FolderLimitExceededError extends DomainError {
  readonly code = 'FOLDER_LIMIT_EXCEEDED';
  readonly kind = 'rule_violation';

  constructor() {
    super('Custom folder limit reached');
  }
}

export class FolderIsSystemError extends DomainError {
  readonly code = 'FOLDER_IS_SYSTEM';
  readonly kind = 'rule_violation';

  constructor() {
    super('System folders cannot be renamed or deleted');
  }
}

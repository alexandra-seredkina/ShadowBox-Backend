import type { IdempotencyClaim } from '../../../shared/kernel/idempotency.js';
import type { Registration, RegistrationResult } from './registration.js';

export abstract class AccountRegistrar {
  /**
   * Creates the account, its system folders, the first address, the session
   * and the idempotency record in one transaction.
   *
   * @throws LoginTakenError, AliasAddressTakenError, IdempotencyKeyTakenError
   */
  abstract register(
    registration: Registration,
    idempotency: IdempotencyClaim | null,
  ): Promise<RegistrationResult>;
}

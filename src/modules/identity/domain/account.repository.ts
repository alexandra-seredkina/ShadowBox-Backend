import type { AccountCredentials, AccountId } from './account.js';

export abstract class AccountRepository {
  abstract findCredentialsById(
    id: AccountId,
  ): Promise<AccountCredentials | null>;
}

import type {
  AccountCredentials,
  AccountId,
  AccountKeys,
  AccountSummary,
} from './account.js';
import type { Login } from './login.js';

export abstract class AccountRepository {
  abstract findCredentialsById(
    id: AccountId,
  ): Promise<AccountCredentials | null>;

  abstract findCredentialsByLogin(
    login: Login,
  ): Promise<AccountCredentials | null>;

  /** @throws Error when the account does not exist. */
  abstract loadSummary(id: AccountId): Promise<AccountSummary>;

  /** @throws Error when the account does not exist. */
  abstract loadKeys(id: AccountId): Promise<AccountKeys>;

  abstract updateAuthKeyHash(id: AccountId, authKeyHash: string): Promise<void>;
}

import type {
  AccountCredentials,
  AccountId,
  AccountKeys,
  AccountSummary,
} from './account.js';
import type { IpHash } from '../../../shared/kernel/ip-hasher.js';
import type { Login } from './login.js';
import type { SessionId } from './session.js';

export abstract class AccountRepository {
  abstract findCredentialsById(
    id: AccountId,
  ): Promise<AccountCredentials | null>;

  abstract findCredentialsByLogin(
    login: Login,
  ): Promise<AccountCredentials | null>;

  /**
   * `now` decides which temporary addresses have expired and no longer count.
   * @throws Error when the account does not exist.
   */
  abstract loadSummary(id: AccountId, now: Date): Promise<AccountSummary>;

  /** @throws Error when the account does not exist. */
  abstract loadKeys(id: AccountId): Promise<AccountKeys>;

  abstract updateAuthKeyHash(id: AccountId, authKeyHash: string): Promise<void>;

  /**
   * Stores the setting and applies it to every session of the account in one
   * transaction; when enabling, the current session is bound to `currentIp`.
   */
  abstract changeIpBinding(change: {
    readonly accountId: AccountId;
    readonly isEnabled: boolean;
    readonly currentSession: SessionId;
    readonly currentIp: IpHash;
  }): Promise<void>;

  /**
   * Revokes every address for good, then deletes the account with its keys,
   * folders, messages, sessions and idempotency records, in one transaction.
   */
  abstract delete(id: AccountId, now: Date): Promise<void>;
}

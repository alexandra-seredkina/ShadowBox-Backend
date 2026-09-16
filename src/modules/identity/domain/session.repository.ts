import type { IpHash } from '../../../shared/kernel/ip-hasher.js';
import type { AccountId } from './account.js';
import type {
  SessionDraft,
  SessionId,
  SessionListing,
  StoredSession,
} from './session.js';

export abstract class SessionRepository {
  abstract create(
    accountId: AccountId,
    draft: SessionDraft,
  ): Promise<SessionId>;

  abstract findByTokenHash(
    tokenHash: Uint8Array,
  ): Promise<StoredSession | null>;

  abstract touch(id: SessionId, now: Date): Promise<void>;

  /** Replaces the token and opens the reauth window in one update. */
  abstract grantReauth(
    id: SessionId,
    change: { readonly tokenHash: Uint8Array; readonly reauthUntil: Date },
  ): Promise<void>;

  /** Rewrites the IP binding under the current key after a key rotation. */
  abstract updateIpHash(id: SessionId, ip: IpHash): Promise<void>;

  abstract delete(id: SessionId): Promise<void>;

  /** No-op when the token is unknown. */
  abstract deleteByTokenHash(tokenHash: Uint8Array): Promise<void>;

  /** Sessions of the account that have not expired yet, most recently used first. */
  abstract listLive(accountId: AccountId, now: Date): Promise<SessionListing[]>;

  /** @returns false when the session is not the account's or has expired. */
  abstract deleteOwn(
    accountId: AccountId,
    id: SessionId,
    now: Date,
  ): Promise<boolean>;

  abstract deleteAllExcept(
    accountId: AccountId,
    keep: SessionId,
  ): Promise<void>;
}

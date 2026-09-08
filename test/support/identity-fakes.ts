import { createHash, randomUUID } from 'node:crypto';
import { AccountKdfRepository } from '../../src/modules/identity/domain/account-kdf.repository.js';
import { DecoySaltSource } from '../../src/modules/identity/domain/decoy-salt.source.js';
import {
  KdfParams,
  standardKdfParams,
} from '../../src/modules/identity/domain/kdf-params.js';
import type { Login } from '../../src/modules/identity/domain/login.js';
import type {
  NewPowChallenge,
  PowChallenge,
  PowChallengeId,
} from '../../src/modules/identity/domain/pow-challenge.js';
import { PowChallengeRepository } from '../../src/modules/identity/domain/pow-challenge.repository.js';
import type {
  AccountCredentials,
  AccountId,
  AccountKeys,
  AccountSummary,
} from '../../src/modules/identity/domain/account.js';
import { AccountRepository } from '../../src/modules/identity/domain/account.repository.js';
import { AccountRegistrar } from '../../src/modules/identity/domain/account-registrar.js';
import { AuthKeyHasher } from '../../src/modules/identity/domain/auth-key-hasher.js';
import {
  AliasAddressTakenError,
  LoginTakenError,
} from '../../src/modules/identity/domain/identity.errors.js';
import {
  NewAccount,
  Registration,
  RegistrationResult,
  toRegistrationSnapshot,
} from '../../src/modules/identity/domain/registration.js';
import type {
  SessionDraft,
  SessionId,
  StoredSession,
} from '../../src/modules/identity/domain/session.js';
import { SessionRepository } from '../../src/modules/identity/domain/session.repository.js';
import type { IpHash } from '../../src/shared/kernel/ip-hasher.js';
import {
  IdempotencyClaim,
  IdempotencyKeyTakenError,
  IdempotencyRepository,
  StoredIdempotentResult,
} from '../../src/shared/kernel/idempotency.js';

export class InMemoryPowChallengeRepository implements PowChallengeRepository {
  readonly saved = new Map<PowChallengeId, PowChallenge>();

  create(challenge: NewPowChallenge): Promise<PowChallenge> {
    const stored = { ...challenge, id: randomUUID() as PowChallengeId };
    this.saved.set(stored.id, stored);
    return Promise.resolve(stored);
  }

  consume(id: PowChallengeId): Promise<PowChallenge | null> {
    const found = this.saved.get(id) ?? null;
    this.saved.delete(id);
    return Promise.resolve(found);
  }
}

export class InMemoryAccountKdfRepository implements AccountKdfRepository {
  private readonly accounts = new Map<string, KdfParams>();

  add(login: string, params: KdfParams): void {
    this.accounts.set(login, params);
  }

  findByLogin(login: Login): Promise<KdfParams | null> {
    return Promise.resolve(this.accounts.get(login) ?? null);
  }
}

export class HashDecoySaltSource implements DecoySaltSource {
  saltFor(login: Login): Uint8Array {
    return createHash('sha256').update(login).digest().subarray(0, 16);
  }
}

interface StoredAccount extends NewAccount {
  readonly id: AccountId;
  readonly createdAt: Date;
  isIpBindingEnabled: boolean;
}

export class InMemorySessionRepository implements SessionRepository {
  readonly sessions = new Map<
    SessionId,
    { -readonly [K in keyof StoredSession]: StoredSession[K] } & {
      tokenHash: Uint8Array;
    }
  >();

  /** Sessions in creation order, for assertions. */
  get created(): { accountId: AccountId; draft: SessionDraft }[] {
    return [...this.drafts];
  }

  private readonly drafts: { accountId: AccountId; draft: SessionDraft }[] = [];

  /** Defaults to the real clock, which the e2e app uses as well. */
  constructor(private readonly now: () => Date = () => new Date()) {}

  create(accountId: AccountId, draft: SessionDraft): Promise<SessionId> {
    const id = randomUUID() as SessionId;
    this.drafts.push({ accountId, draft });
    this.sessions.set(id, {
      id,
      accountId,
      tokenHash: draft.tokenHash,
      ip: draft.ip,
      isIpBound: draft.isIpBound,
      reauthUntil: null,
      lastActiveAt: this.now(),
      expiresAt: draft.expiresAt,
    });
    return Promise.resolve(id);
  }

  findByTokenHash(tokenHash: Uint8Array): Promise<StoredSession | null> {
    const found = [...this.sessions.values()].find((session) =>
      Buffer.from(session.tokenHash).equals(tokenHash),
    );
    return Promise.resolve(found === undefined ? null : { ...found });
  }

  touch(id: SessionId, now: Date): Promise<void> {
    const session = this.sessions.get(id);
    if (session !== undefined) {
      session.lastActiveAt = now;
    }
    return Promise.resolve();
  }

  grantReauth(
    id: SessionId,
    change: { readonly tokenHash: Uint8Array; readonly reauthUntil: Date },
  ): Promise<void> {
    const session = this.sessions.get(id);
    if (session === undefined) {
      return Promise.reject(new Error('Unknown session'));
    }
    session.tokenHash = change.tokenHash;
    session.reauthUntil = change.reauthUntil;
    return Promise.resolve();
  }

  updateIpHash(id: SessionId, ip: IpHash): Promise<void> {
    const session = this.sessions.get(id);
    if (session !== undefined) {
      session.ip = ip;
    }
    return Promise.resolve();
  }

  delete(id: SessionId): Promise<void> {
    this.sessions.delete(id);
    return Promise.resolve();
  }

  deleteByTokenHash(tokenHash: Uint8Array): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (Buffer.from(session.tokenHash).equals(tokenHash)) {
        this.sessions.delete(id);
      }
    }
    return Promise.resolve();
  }
}

/** Accounts, aliases and idempotency records of the registration transaction. */
export class InMemoryAccountStore
  implements AccountRegistrar, AccountRepository, IdempotencyRepository
{
  readonly accounts = new Map<AccountId, StoredAccount>();
  readonly aliasAddresses = new Set<string>();
  readonly records = new Map<
    string,
    StoredIdempotentResult & { expiresAt: Date }
  >();
  /** Addresses that already exist, to exercise the retry on collision. */
  readonly takenAddresses = new Set<string>();
  readonly sessionStore: InMemorySessionRepository;

  constructor(
    private readonly now: () => Date = () => new Date(0),
    sessions?: InMemorySessionRepository,
  ) {
    this.sessionStore = sessions ?? new InMemorySessionRepository(now);
  }

  /** Sessions opened by registrations, in order. */
  get sessions(): { accountId: AccountId; draft: SessionDraft }[] {
    return this.sessionStore.created;
  }

  async register(
    registration: Registration,
    idempotency: IdempotencyClaim | null,
  ): Promise<RegistrationResult> {
    const { account, firstAlias } = registration;
    const address = `${firstAlias.localPart}@${firstAlias.domain}`;
    if ([...this.accounts.values()].some((a) => a.login === account.login)) {
      throw new LoginTakenError();
    }
    if (this.takenAddresses.has(address) || this.aliasAddresses.has(address)) {
      throw new AliasAddressTakenError();
    }
    if (idempotency !== null && this.records.has(idempotency.key)) {
      throw new IdempotencyKeyTakenError();
    }
    const id = randomUUID() as AccountId;
    const createdAt = this.now();
    this.accounts.set(id, {
      ...account,
      id,
      createdAt,
      isIpBindingEnabled: true,
    });
    this.aliasAddresses.add(address);
    await this.sessionStore.create(id, registration.session);
    const result: RegistrationResult = {
      account: {
        id,
        login: account.login,
        createdAt,
        isIpBindingEnabled: true,
        activeAliases: 1,
      },
      firstAlias: {
        id: randomUUID(),
        localPart: firstAlias.localPart,
        domain: firstAlias.domain,
        kind: 'permanent',
        status: 'active',
        folderId: null,
        expiresAt: null,
        createdAt,
        lastReceivedAt: null,
      },
    };
    if (idempotency !== null) {
      this.records.set(idempotency.key, {
        operation: idempotency.operation,
        requestHash: idempotency.requestHash,
        accountId: id,
        snapshot: JSON.parse(JSON.stringify(toRegistrationSnapshot(result))),
        expiresAt: idempotency.expiresAt,
      });
    }
    return result;
  }

  findCredentialsById(id: AccountId): Promise<AccountCredentials | null> {
    return Promise.resolve(this.credentialsOf(this.accounts.get(id)));
  }

  findCredentialsByLogin(login: Login): Promise<AccountCredentials | null> {
    const account = [...this.accounts.values()].find((a) => a.login === login);
    return Promise.resolve(this.credentialsOf(account));
  }

  loadSummary(id: AccountId): Promise<AccountSummary> {
    const account = this.require(id);
    return Promise.resolve({
      id,
      login: account.login,
      createdAt: account.createdAt,
      isIpBindingEnabled: account.isIpBindingEnabled,
      activeAliases: 1,
    });
  }

  loadKeys(id: AccountId): Promise<AccountKeys> {
    const account = this.require(id);
    return Promise.resolve({
      publicKey: account.publicKey,
      encryptedPrivateKey: account.encryptedPrivateKey,
      kdf: account.kdf,
    });
  }

  updateAuthKeyHash(id: AccountId, authKeyHash: string): Promise<void> {
    this.accounts.set(id, { ...this.require(id), authKeyHash });
    return Promise.resolve();
  }

  findByKey(key: string, now: Date): Promise<StoredIdempotentResult | null> {
    const record = this.records.get(key);
    return Promise.resolve(
      record === undefined || record.expiresAt <= now ? null : record,
    );
  }

  private require(id: AccountId): StoredAccount {
    const account = this.accounts.get(id);
    if (account === undefined) {
      throw new Error(`Unknown account ${id}`);
    }
    return account;
  }

  private credentialsOf(
    account: StoredAccount | undefined,
  ): AccountCredentials | null {
    return account === undefined
      ? null
      : {
          id: account.id,
          authKeyHash: account.authKeyHash,
          isIpBindingEnabled: account.isIpBindingEnabled,
        };
  }
}

/** Instant stand-in for Argon2id: the e2e and handler tests do not need its cost. */
export class FakeAuthKeyHasher implements AuthKeyHasher {
  hash(authKey: Uint8Array): Promise<string> {
    return Promise.resolve(`fake$${Buffer.from(authKey).toString('hex')}`);
  }

  verify(hash: string, authKey: Uint8Array): Promise<boolean> {
    return Promise.resolve(
      hash === `fake$${Buffer.from(authKey).toString('hex')}`,
    );
  }

  needsRehash(_hash: string): boolean {
    return false;
  }
}

/** Registers an account straight in the store, bypassing PoW and hashing cost. */
export async function seedAccount(
  store: InMemoryAccountStore,
  params: { readonly login: string; readonly authKey: Uint8Array },
): Promise<RegistrationResult> {
  const hash = await new FakeAuthKeyHasher().hash(params.authKey);
  return store.register(
    {
      account: {
        login: params.login as Login,
        authKeyHash: hash,
        kdf: standardKdfParams(new Uint8Array(16).fill(2)),
        publicKey: new Uint8Array(32).fill(3),
        encryptedPrivateKey: {
          nonce: new Uint8Array(24).fill(4),
          ciphertext: new Uint8Array(48).fill(5),
        },
        recoveryEncryptedPrivateKey: {
          nonce: new Uint8Array(24).fill(6),
          ciphertext: new Uint8Array(48).fill(7),
        },
      },
      firstAlias: {
        localPart: randomUUID().slice(0, 10),
        domain: 'shadowbox.test',
      },
      session: {
        tokenHash: new Uint8Array(32),
        ip: { hash: new Uint8Array(32), keyVersion: 1 },
        isIpBound: true,
        device: 'Other · Other',
        expiresAt: new Date(8.64e15),
      },
    },
    null,
  );
}

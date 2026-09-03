import { createHash, randomUUID } from 'node:crypto';
import { AccountKdfRepository } from '../../src/modules/identity/domain/account-kdf.repository.js';
import { DecoySaltSource } from '../../src/modules/identity/domain/decoy-salt.source.js';
import type { KdfParams } from '../../src/modules/identity/domain/kdf-params.js';
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
} from '../../src/modules/identity/domain/session.js';
import { SessionRepository } from '../../src/modules/identity/domain/session.repository.js';
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

/** Accounts, folders, aliases and idempotency records of the registration transaction. */
export class InMemoryAccountStore
  implements AccountRegistrar, AccountRepository, IdempotencyRepository
{
  readonly accounts = new Map<AccountId, NewAccount & { id: AccountId }>();
  readonly aliasAddresses = new Set<string>();
  readonly sessions: { accountId: AccountId; draft: SessionDraft }[] = [];
  readonly records = new Map<
    string,
    StoredIdempotentResult & { expiresAt: Date }
  >();
  /** Addresses that already exist, to exercise the retry on collision. */
  readonly takenAddresses = new Set<string>();

  constructor(private readonly now: () => Date = () => new Date(0)) {}

  register(
    registration: Registration,
    idempotency: IdempotencyClaim | null,
  ): Promise<RegistrationResult> {
    const { account, firstAlias } = registration;
    const address = `${firstAlias.localPart}@${firstAlias.domain}`;
    if ([...this.accounts.values()].some((a) => a.login === account.login)) {
      return Promise.reject(new LoginTakenError());
    }
    if (this.takenAddresses.has(address) || this.aliasAddresses.has(address)) {
      return Promise.reject(new AliasAddressTakenError());
    }
    if (idempotency !== null && this.records.has(idempotency.key)) {
      return Promise.reject(new IdempotencyKeyTakenError());
    }
    const id = randomUUID() as AccountId;
    const createdAt = this.now();
    this.accounts.set(id, { ...account, id });
    this.aliasAddresses.add(address);
    this.sessions.push({ accountId: id, draft: registration.session });
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
    return Promise.resolve(result);
  }

  findCredentialsById(id: AccountId): Promise<AccountCredentials | null> {
    const account = this.accounts.get(id);
    return Promise.resolve(
      account === undefined
        ? null
        : { id, authKeyHash: account.authKeyHash, isIpBindingEnabled: true },
    );
  }

  findByKey(key: string, now: Date): Promise<StoredIdempotentResult | null> {
    const record = this.records.get(key);
    return Promise.resolve(
      record === undefined || record.expiresAt <= now ? null : record,
    );
  }
}

export class InMemorySessionRepository implements SessionRepository {
  readonly created: { accountId: AccountId; draft: SessionDraft }[] = [];

  create(accountId: AccountId, draft: SessionDraft): Promise<SessionId> {
    this.created.push({ accountId, draft });
    return Promise.resolve(randomUUID() as SessionId);
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

  needsRehash(): boolean {
    return false;
  }
}

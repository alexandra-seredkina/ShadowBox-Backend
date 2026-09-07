import {
  FakeAuthKeyHasher,
  InMemoryAccountStore,
  InMemoryPowChallengeRepository,
  InMemorySessionRepository,
  seedAccount,
} from '../../../../test/support/identity-fakes.js';
import {
  FixedClock,
  InMemoryAttemptCounter,
  PlainIpHasher,
  SequentialRandom,
} from '../../../../test/support/kernel-fakes.js';
import { solvePow } from '../../../../test/support/pow.js';
import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import type { AccountId } from '../domain/account.js';
import {
  AccountLockedError,
  InvalidCredentialsError,
  PowInvalidError,
  PowRequiredError,
} from '../domain/identity.errors.js';
import { createPowChallenge } from '../domain/pow-challenge.js';
import { SIGN_IN_WINDOW_MS } from '../domain/sign-in-policy.js';
import { PowVerifier } from './pow-verifier.js';
import { SessionIssuer } from './session-issuer.js';
import { SignInCommand, SignInHandler } from './sign-in.handler.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const AUTH_KEY = new Uint8Array(32).fill(1);
const WRONG_KEY = new Uint8Array(32).fill(9);
const client = { ip: '203.0.113.7', userAgent: undefined };

/** `weak$` hashes stand for ones made with older, cheaper parameters. */
class CountingHasher extends FakeAuthKeyHasher {
  verifications = 0;

  override verify(hash: string, authKey: Uint8Array): Promise<boolean> {
    this.verifications += 1;
    return super.verify(hash.replace(/^weak\$/, 'fake$'), authKey);
  }

  override needsRehash(hash: string): boolean {
    return hash.startsWith('weak$');
  }
}

describe('SignInHandler', () => {
  let clock: FixedClock;
  let sessions: InMemorySessionRepository;
  let store: InMemoryAccountStore;
  let challenges: InMemoryPowChallengeRepository;
  let hasher: CountingHasher;
  let handler: SignInHandler;
  let accountId: AccountId;

  function attempt(overrides: Partial<SignInCommand> = {}): Promise<unknown> {
    return handler.execute({
      login: 'kage',
      authKey: AUTH_KEY,
      pow: null,
      client,
      ...overrides,
    });
  }

  async function failTimes(count: number, login = 'kage'): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await expect(
        attempt({ login, authKey: WRONG_KEY }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
  }

  async function solvedLoginPow(): Promise<{
    challengeId: string;
    nonce: string;
  }> {
    const challenge = await challenges.create(
      createPowChallenge({
        purpose: 'login',
        prefix: new Uint8Array(16).fill(challenges.saved.size + 1),
        difficulty: 8,
        now: clock.now(),
      }),
    );
    return { challengeId: challenge.id, nonce: solvePow(challenge.prefix, 8) };
  }

  beforeEach(async () => {
    clock = new FixedClock(NOW);
    sessions = new InMemorySessionRepository(() => clock.now());
    store = new InMemoryAccountStore(() => clock.now(), sessions);
    challenges = new InMemoryPowChallengeRepository();
    hasher = new CountingHasher();
    const random = new SequentialRandom();
    handler = new SignInHandler(
      store,
      sessions,
      hasher,
      new InMemoryAttemptCounter(),
      new PowVerifier(challenges, clock),
      new SessionIssuer(random, new PlainIpHasher(), clock),
      random,
      clock,
    );
    ({
      account: { id: accountId },
    } = await seedAccount(store, {
      login: 'kage',
      authKey: AUTH_KEY,
    }));
  });

  it('opens a new session and returns the account and its keys', async () => {
    const outcome = await handler.execute({
      login: 'KAGE',
      authKey: AUTH_KEY,
      pow: null,
      client,
    });

    expect(outcome.account.id).toBe(accountId);
    expect(outcome.keys.publicKey).toEqual(new Uint8Array(32).fill(3));
    expect(outcome.sessionToken).toHaveLength(32);
    expect(sessions.created.at(-1)).toMatchObject({
      accountId,
      draft: { isIpBound: true },
    });
  });

  it('answers a wrong key and an unknown login the same way', async () => {
    await expect(attempt({ authKey: WRONG_KEY })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    await expect(attempt({ login: 'nobody' })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('runs Argon2id for an unknown login too', async () => {
    await attempt({ login: 'nobody' }).catch(() => undefined);

    expect(hasher.verifications).toBe(1);
  });

  it('rejects a malformed login before touching any account', async () => {
    await expect(attempt({ login: 'a' })).rejects.toBeInstanceOf(
      ValidationFailedError,
    );
    expect(hasher.verifications).toBe(0);
  });

  it('requires proof-of-work after five failures of a login', async () => {
    await failTimes(5);

    await expect(attempt()).rejects.toBeInstanceOf(PowRequiredError);
  });

  it('accepts the right key with a solved login challenge', async () => {
    await failTimes(5);

    await expect(
      attempt({ pow: await solvedLoginPow() }),
    ).resolves.toBeDefined();
  });

  it('rejects a wrong proof-of-work once it is required', async () => {
    await failTimes(5);
    const pow = await solvedLoginPow();

    await expect(
      attempt({ pow: { ...pow, nonce: `${pow.nonce}0` } }),
    ).rejects.toBeInstanceOf(PowInvalidError);
  });

  it('counts failures for logins that do not exist', async () => {
    await failTimes(5, 'nobody');

    await expect(attempt({ login: 'nobody' })).rejects.toBeInstanceOf(
      PowRequiredError,
    );
  });

  it('requires proof-of-work after twenty failures from one IP', async () => {
    for (let index = 0; index < 20; index += 1) {
      await attempt({ login: `user${index}`, authKey: WRONG_KEY }).catch(
        () => undefined,
      );
    }

    await expect(attempt()).rejects.toBeInstanceOf(PowRequiredError);
  });

  it('locks the login after ten failures, even for the right key', async () => {
    await failTimes(5);
    for (let index = 0; index < 5; index += 1) {
      await expect(
        attempt({ authKey: WRONG_KEY, pow: await solvedLoginPow() }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }

    const locked = await attempt({ pow: await solvedLoginPow() }).catch(
      (error: unknown) => error,
    );

    expect(locked).toBeInstanceOf(AccountLockedError);
    expect((locked as AccountLockedError).retryAfterSeconds).toBe(
      SIGN_IN_WINDOW_MS / 1000,
    );
  });

  it('drops the proof-of-work requirement once the window has passed', async () => {
    await failTimes(5);
    clock.advanceBy(SIGN_IN_WINDOW_MS);

    await expect(attempt()).resolves.toBeDefined();
  });

  it('forgets the failures of a login after a success', async () => {
    await failTimes(4);
    await attempt();
    await failTimes(4);

    await expect(attempt()).resolves.toBeDefined();
  });

  it('rehashes a key stored with weaker parameters', async () => {
    const account = store.accounts.get(accountId);
    const current = account?.authKeyHash ?? '';
    if (account !== undefined) {
      store.accounts.set(accountId, {
        ...account,
        authKeyHash: current.replace(/^fake\$/, 'weak$'),
      });
    }

    await attempt();

    expect(store.accounts.get(accountId)?.authKeyHash).toBe(current);
  });
});

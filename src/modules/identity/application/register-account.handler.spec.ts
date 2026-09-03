import {
  FakeAuthKeyHasher,
  InMemoryAccountStore,
  InMemoryPowChallengeRepository,
  InMemorySessionRepository,
} from '../../../../test/support/identity-fakes.js';
import {
  FixedClock,
  PlainIpHasher,
  SequentialRandom,
} from '../../../../test/support/kernel-fakes.js';
import { findFailingNonce, solvePow } from '../../../../test/support/pow.js';
import { createTestConfig } from '../../../../test/support/test-config.js';
import { IdempotencyConflictError } from '../../../shared/errors/idempotency-conflict.error.js';
import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import { SecureRandom } from '../../../shared/kernel/secure-random.js';
import {
  LoginReservedError,
  LoginTakenError,
  PowInvalidError,
} from '../domain/identity.errors.js';
import {
  createPowChallenge,
  POW_TTL_MS,
  PowChallengeId,
} from '../domain/pow-challenge.js';
import {
  RegisterAccountCommand,
  RegisterAccountHandler,
} from './register-account.handler.js';
import { SessionIssuer } from './session-issuer.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const DIFFICULTY = 8;
const IDEMPOTENCY_KEY = '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0d';

function bytes(length: number, fill: number): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

describe('RegisterAccountHandler', () => {
  let clock: FixedClock;
  let store: InMemoryAccountStore;
  let sessions: InMemorySessionRepository;
  let challenges: InMemoryPowChallengeRepository;
  let random: SecureRandom;
  let handler: RegisterAccountHandler;

  async function solvedPow(
    purpose: 'register' | 'login' = 'register',
  ): Promise<RegisterAccountCommand['pow']> {
    const challenge = await challenges.create(
      createPowChallenge({
        purpose,
        prefix: bytes(16, challenges.saved.size + 1),
        difficulty: DIFFICULTY,
        now: clock.now(),
      }),
    );
    return {
      challengeId: challenge.id,
      nonce: solvePow(challenge.prefix, DIFFICULTY),
    };
  }

  async function command(
    overrides: Partial<RegisterAccountCommand> = {},
  ): Promise<RegisterAccountCommand> {
    return {
      login: 'Kage',
      authKey: bytes(32, 1),
      kdfSalt: bytes(16, 2),
      publicKey: bytes(32, 3),
      encryptedPrivateKey: { nonce: bytes(24, 4), ciphertext: bytes(48, 5) },
      recoveryEncryptedPrivateKey: {
        nonce: bytes(24, 6),
        ciphertext: bytes(48, 7),
      },
      pow: await solvedPow(),
      idempotencyKey: null,
      client: {
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0',
      },
      ...overrides,
    };
  }

  function buildHandler(): RegisterAccountHandler {
    const hasher = new FakeAuthKeyHasher();
    return new RegisterAccountHandler(
      store,
      store,
      sessions,
      challenges,
      store,
      hasher,
      new SessionIssuer(random, new PlainIpHasher(), clock),
      random,
      clock,
      createTestConfig(),
    );
  }

  beforeEach(() => {
    clock = new FixedClock(NOW);
    store = new InMemoryAccountStore(() => clock.now());
    sessions = new InMemorySessionRepository();
    challenges = new InMemoryPowChallengeRepository();
    random = new SequentialRandom();
    handler = buildHandler();
  });

  it('creates the account with a normalized login and a hashed authKey', async () => {
    const { result } = await handler.execute(await command());

    const stored = store.accounts.get(result.account.id);
    expect(stored?.login).toBe('kage');
    expect(stored?.authKeyHash).toBe(`fake$${'01'.repeat(32)}`);
    expect(stored?.kdf).toEqual({
      algorithm: 'argon2id13',
      salt: bytes(16, 2),
      opsLimit: 3,
      memLimitBytes: 67108864,
    });
  });

  it('issues a permanent first address on the configured domain', async () => {
    const { result } = await handler.execute(await command());

    expect(result.firstAlias).toMatchObject({
      kind: 'permanent',
      status: 'active',
      domain: 'shadowbox.test',
      folderId: null,
    });
    expect(result.firstAlias.localPart).toMatch(/^[a-z0-9]{10}$/);
  });

  it('opens an IP-bound session and returns its token once', async () => {
    const { result, sessionToken } = await handler.execute(await command());

    expect(sessionToken).toHaveLength(32);
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]).toMatchObject({
      accountId: result.account.id,
      draft: {
        isIpBound: true,
        device: 'Firefox · Linux',
        ip: { hash: Buffer.from('203.0.113.7'), keyVersion: 1 },
        expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    expect(store.sessions[0]?.draft.tokenHash).not.toEqual(sessionToken);
  });

  it('rejects a reserved login before spending the proof-of-work', async () => {
    const request = await command({ login: 'P0stmaster' });

    await expect(handler.execute(request)).rejects.toBeInstanceOf(
      LoginReservedError,
    );
    expect(challenges.saved.size).toBe(1);
  });

  it('rejects a malformed login', async () => {
    await expect(
      handler.execute(await command({ login: '-kage' })),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('rejects a taken login', async () => {
    await handler.execute(await command());

    await expect(
      handler.execute(await command({ login: 'KAGE' })),
    ).rejects.toBeInstanceOf(LoginTakenError);
  });

  it('rejects an unknown challenge', async () => {
    const pow = {
      challengeId: '0192c5a0-0000-7000-8000-000000000000',
      nonce: '1',
    };

    await expect(
      handler.execute(await command({ pow })),
    ).rejects.toBeInstanceOf(PowInvalidError);
  });

  it('rejects a nonce that misses the difficulty', async () => {
    const pow = await solvedPow();
    const prefix = challenges.saved.get(
      pow.challengeId as PowChallengeId,
    )?.prefix;
    const nonce = findFailingNonce(prefix ?? bytes(16, 0), DIFFICULTY);

    await expect(
      handler.execute(await command({ pow: { ...pow, nonce } })),
    ).rejects.toBeInstanceOf(PowInvalidError);
  });

  it('rejects a solution for a login challenge', async () => {
    await expect(
      handler.execute(await command({ pow: await solvedPow('login') })),
    ).rejects.toBeInstanceOf(PowInvalidError);
  });

  it('rejects an expired challenge', async () => {
    const request = await command();
    clock.advanceBy(POW_TTL_MS);

    await expect(handler.execute(request)).rejects.toBeInstanceOf(
      PowInvalidError,
    );
  });

  it('accepts each challenge only once', async () => {
    const request = await command();
    await handler.execute(request);

    await expect(
      handler.execute({ ...request, login: 'other' }),
    ).rejects.toBeInstanceOf(PowInvalidError);
  });

  it('draws a new address when the generated one is taken', async () => {
    // SequentialRandom: the session token is draw 1, the first address draw 2.
    store.takenAddresses.add('cccccccccc@shadowbox.test');

    const { result } = await handler.execute(await command());

    expect(result.firstAlias.localPart).toBe('dddddddddd');
  });

  describe('with an Idempotency-Key', () => {
    it('replays the original answer with a fresh session', async () => {
      const request = await command({ idempotencyKey: IDEMPOTENCY_KEY });
      const first = await handler.execute(request);

      const second = await handler.execute(request);

      expect(second.result).toEqual(first.result);
      expect(second.sessionToken).not.toEqual(first.sessionToken);
      expect(sessions.created).toHaveLength(1);
      expect(store.accounts.size).toBe(1);
    });

    it('refuses the same key with another body', async () => {
      const request = await command({ idempotencyKey: IDEMPOTENCY_KEY });
      await handler.execute(request);

      await expect(
        handler.execute({ ...request, publicKey: bytes(32, 9) }),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);
    });

    it('refuses a replay with another authKey', async () => {
      const request = await command({ idempotencyKey: IDEMPOTENCY_KEY });
      await handler.execute(request);

      await expect(
        handler.execute({ ...request, authKey: bytes(32, 9) }),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);
    });

    it('runs again once the record has expired', async () => {
      const request = await command({ idempotencyKey: IDEMPOTENCY_KEY });
      await handler.execute(request);
      clock.advanceBy(24 * 60 * 60 * 1000);

      await expect(handler.execute(request)).rejects.toBeInstanceOf(
        PowInvalidError,
      );
    });
  });
});

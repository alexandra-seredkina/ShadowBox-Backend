import {
  FakeAuthKeyHasher,
  InMemoryAccountStore,
  InMemorySessionRepository,
  seedAccount,
} from '../../../../test/support/identity-fakes.js';
import {
  FixedClock,
  SequentialRandom,
} from '../../../../test/support/kernel-fakes.js';
import { InvalidCredentialsError } from '../domain/identity.errors.js';
import {
  hashSessionToken,
  REAUTH_WINDOW_MS,
  SessionId,
} from '../domain/session.js';
import type { AuthenticatedSession } from './authenticate-session.handler.js';
import { EndSessionHandler } from './end-session.handler.js';
import { ReauthenticateHandler } from './reauthenticate.handler.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const AUTH_KEY = new Uint8Array(32).fill(1);

describe('ReauthenticateHandler and EndSessionHandler', () => {
  let clock: FixedClock;
  let sessions: InMemorySessionRepository;
  let session: AuthenticatedSession;
  let reauthenticate: ReauthenticateHandler;

  beforeEach(async () => {
    clock = new FixedClock(NOW);
    sessions = new InMemorySessionRepository(() => clock.now());
    const store = new InMemoryAccountStore(() => clock.now(), sessions);
    const { account } = await seedAccount(store, {
      login: 'kage',
      authKey: AUTH_KEY,
    });
    const [sessionId] = [...sessions.sessions.keys()] as [SessionId];
    session = { sessionId, accountId: account.id, reauthUntil: null };
    reauthenticate = new ReauthenticateHandler(
      store,
      sessions,
      new FakeAuthKeyHasher(),
      new SequentialRandom(),
      clock,
    );
  });

  it('opens the reauth window for five minutes and rotates the token', async () => {
    const before = sessions.sessions.get(session.sessionId)?.tokenHash;

    const token = await reauthenticate.execute({ session, authKey: AUTH_KEY });

    const stored = sessions.sessions.get(session.sessionId);
    expect(stored?.reauthUntil).toEqual(
      new Date(NOW.getTime() + REAUTH_WINDOW_MS),
    );
    expect(stored?.tokenHash).toEqual(hashSessionToken(token));
    expect(stored?.tokenHash).not.toEqual(before);
  });

  it('refuses a wrong key and leaves the session as it was', async () => {
    await expect(
      reauthenticate.execute({ session, authKey: new Uint8Array(32).fill(9) }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(sessions.sessions.get(session.sessionId)?.reauthUntil).toBeNull();
  });

  it('signs out by deleting the session behind the cookie', async () => {
    const token = await reauthenticate.execute({ session, authKey: AUTH_KEY });

    await new EndSessionHandler(sessions).execute(
      Buffer.from(token).toString('base64url'),
    );

    expect(sessions.sessions.size).toBe(0);
  });

  it('ignores a missing or malformed cookie on sign-out', async () => {
    const end = new EndSessionHandler(sessions);

    await end.execute(null);
    await end.execute('not-a-token');

    expect(sessions.sessions.size).toBe(1);
  });
});

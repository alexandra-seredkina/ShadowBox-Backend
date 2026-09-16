import {
  InMemoryAccountStore,
  InMemorySessionRepository,
  seedAccount,
} from '../../../../test/support/identity-fakes.js';
import {
  FixedClock,
  PlainIpHasher,
} from '../../../../test/support/kernel-fakes.js';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { ReauthRequiredError } from '../../../shared/errors/reauth-required.error.js';
import type { SessionId } from '../domain/session.js';
import { SESSION_IDLE_TTL_MS } from '../domain/session.js';
import type { AuthenticatedSession } from './authenticate-session.handler.js';
import { ChangeIpBindingHandler } from './change-ip-binding.handler.js';
import { DeleteAccountHandler } from './delete-account.handler.js';
import { EndOtherSessionsHandler } from './end-other-sessions.handler.js';
import { EndOwnSessionHandler } from './end-own-session.handler.js';
import { ListSessionsHandler } from './list-sessions.handler.js';

const NOW = new Date('2020-01-15T12:00:00Z');

describe('account and session handlers', () => {
  let clock: FixedClock;
  let sessions: InMemorySessionRepository;
  let store: InMemoryAccountStore;
  let current: AuthenticatedSession;
  let otherSession: SessionId;

  beforeEach(async () => {
    clock = new FixedClock(NOW);
    sessions = new InMemorySessionRepository(() => clock.now());
    store = new InMemoryAccountStore(() => clock.now(), sessions);
    const { account } = await seedAccount(store, {
      login: 'kage',
      authKey: new Uint8Array(32),
    });
    const [first] = [...sessions.sessions.keys()] as [SessionId];
    current = { sessionId: first, accountId: account.id, reauthUntil: null };
    await seedAccount(store, {
      login: 'kage-laptop',
      authKey: new Uint8Array(32),
    });
    otherSession = await sessions.create(account.id, {
      tokenHash: new Uint8Array(32).fill(1),
      ip: { hash: Buffer.from('198.51.100.1'), keyVersion: 1 },
      isIpBound: true,
      device: 'Firefox · Linux',
      expiresAt: new Date(NOW.getTime() + SESSION_IDLE_TTL_MS * 30),
    });
  });

  it('lists only the account’s live sessions and marks the current one', async () => {
    clock.advanceBy(1);
    const listed = await new ListSessionsHandler(sessions, clock).execute(
      current,
    );

    expect(listed.map((session) => session.id).sort()).toEqual(
      [current.sessionId, otherSession].sort(),
    );
    expect(listed.find((session) => session.isCurrent)?.id).toBe(
      current.sessionId,
    );
  });

  it('tells whether the ended session was the current one', async () => {
    const end = new EndOwnSessionHandler(sessions, clock);

    await expect(end.execute({ current, id: otherSession })).resolves.toBe(
      false,
    );
    await expect(end.execute({ current, id: current.sessionId })).resolves.toBe(
      true,
    );
    await expect(
      end.execute({ current, id: otherSession }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('ends all sessions but the current one', async () => {
    await new EndOtherSessionsHandler(sessions).execute(current);

    const left = [...sessions.sessions.values()].filter(
      (session) => session.accountId === current.accountId,
    );
    expect(left.map((session) => session.id)).toEqual([current.sessionId]);
  });

  it('binds the current session to the caller’s address', async () => {
    const handler = new ChangeIpBindingHandler(
      store,
      new PlainIpHasher(),
      clock,
    );

    const account = await handler.execute({
      current,
      isEnabled: true,
      ip: '203.0.113.9',
    });

    expect(account.isIpBindingEnabled).toBe(true);
    expect(
      Buffer.from(
        sessions.sessions.get(current.sessionId)?.ip.hash ?? [],
      ).toString(),
    ).toBe('203.0.113.9');
    await handler.execute({ current, isEnabled: false, ip: '203.0.113.9' });
    expect(sessions.sessions.get(otherSession)?.isIpBound).toBe(false);
  });

  it('deletes the account only inside the reauth window', async () => {
    const remove = new DeleteAccountHandler(store, clock);

    await expect(remove.execute(current)).rejects.toBeInstanceOf(
      ReauthRequiredError,
    );
    await remove.execute({
      ...current,
      reauthUntil: new Date(NOW.getTime() + 60_000),
    });

    expect(store.accounts.has(current.accountId)).toBe(false);
  });
});

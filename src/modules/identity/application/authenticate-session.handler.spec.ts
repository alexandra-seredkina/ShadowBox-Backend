import { InMemorySessionRepository } from '../../../../test/support/identity-fakes.js';
import {
  FixedClock,
  PlainIpHasher,
  SequentialRandom,
} from '../../../../test/support/kernel-fakes.js';
import type { AccountId } from '../domain/account.js';
import { UnauthenticatedError } from '../domain/identity.errors.js';
import {
  SESSION_IDLE_TTL_MS,
  SESSION_TOUCH_INTERVAL_MS,
  SessionId,
} from '../domain/session.js';
import { AuthenticateSessionHandler } from './authenticate-session.handler.js';
import { SessionIssuer } from './session-issuer.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const ACCOUNT = '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0e' as AccountId;
const IP = '203.0.113.7';

describe('AuthenticateSessionHandler', () => {
  let clock: FixedClock;
  let sessions: InMemorySessionRepository;
  let handler: AuthenticateSessionHandler;
  let issuer: SessionIssuer;

  async function open(
    isIpBound: boolean,
  ): Promise<{ id: SessionId; cookie: string }> {
    const { token, draft } = issuer.issue({
      client: { ip: IP, userAgent: undefined },
      isIpBound,
    });
    const id = await sessions.create(ACCOUNT, draft);
    return { id, cookie: Buffer.from(token).toString('base64url') };
  }

  beforeEach(() => {
    clock = new FixedClock(NOW);
    sessions = new InMemorySessionRepository(() => clock.now());
    issuer = new SessionIssuer(
      new SequentialRandom(),
      new PlainIpHasher(),
      clock,
    );
    handler = new AuthenticateSessionHandler(
      sessions,
      new PlainIpHasher(),
      clock,
    );
  });

  it('resolves a live cookie to its session', async () => {
    const { id, cookie } = await open(true);

    await expect(handler.execute({ token: cookie, ip: IP })).resolves.toEqual({
      sessionId: id,
      accountId: ACCOUNT,
      reauthUntil: null,
    });
  });

  it.each([null, 'garbage', Buffer.alloc(32, 99).toString('base64url')])(
    'rejects the cookie %j',
    async (token) => {
      await expect(handler.execute({ token, ip: IP })).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    },
  );

  it('deletes a bound session used from another IP', async () => {
    const { id, cookie } = await open(true);

    await expect(
      handler.execute({ token: cookie, ip: '198.51.100.1' }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(sessions.sessions.has(id)).toBe(false);
  });

  it('lets an unbound session move between IPs', async () => {
    const { cookie } = await open(false);

    await expect(
      handler.execute({ token: cookie, ip: '198.51.100.1' }),
    ).resolves.toBeDefined();
  });

  it('deletes a session idle for a day', async () => {
    const { id, cookie } = await open(true);
    clock.advanceBy(SESSION_IDLE_TTL_MS);

    await expect(
      handler.execute({ token: cookie, ip: IP }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(sessions.sessions.has(id)).toBe(false);
  });

  it('keeps an active session alive by recording activity', async () => {
    const { id, cookie } = await open(true);
    clock.advanceBy(SESSION_TOUCH_INTERVAL_MS);

    await handler.execute({ token: cookie, ip: IP });

    expect(sessions.sessions.get(id)?.lastActiveAt).toEqual(clock.now());
  });

  it('moves a bound session to the current IP key after a rotation', async () => {
    const { id, cookie } = await open(true);
    const stored = sessions.sessions.get(id);
    if (stored !== undefined) {
      stored.ip = { hash: Buffer.from(IP), keyVersion: 0 };
    }

    await handler.execute({ token: cookie, ip: IP });

    expect(sessions.sessions.get(id)?.ip.keyVersion).toBe(1);
  });
});

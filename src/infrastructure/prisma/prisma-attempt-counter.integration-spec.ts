import {
  createTestPrisma,
  resetDatabase,
} from '../../../test/support/test-database.js';
import { createTestConfig } from '../../../test/support/test-config.js';
import { PrismaAttemptCounter } from './prisma-attempt-counter.js';
import type { PrismaService } from './prisma.service.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const WINDOW_MS = 15 * 60 * 1000;
const key = { scope: 'sign-in:login', subject: 'kage' };

describe('PrismaAttemptCounter', () => {
  let prisma: PrismaService;
  let counter: PrismaAttemptCounter;

  beforeAll(() => {
    prisma = createTestPrisma();
    counter = new PrismaAttemptCounter(prisma, createTestConfig());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('starts a window on the first attempt and counts inside it', async () => {
    await counter.increment(key, WINDOW_MS, NOW);
    const second = await counter.increment(
      key,
      WINDOW_MS,
      new Date(NOW.getTime() + 1000),
    );

    expect(second).toEqual({
      count: 2,
      resetsAt: new Date(NOW.getTime() + WINDOW_MS),
    });
    await expect(counter.peek(key, NOW)).resolves.toEqual(second);
  });

  it('starts over once the window has ended', async () => {
    await counter.increment(key, WINDOW_MS, NOW);
    const later = new Date(NOW.getTime() + WINDOW_MS);

    await expect(counter.peek(key, later)).resolves.toEqual({
      count: 0,
      resetsAt: null,
    });
    await expect(counter.increment(key, WINDOW_MS, later)).resolves.toEqual({
      count: 1,
      resetsAt: new Date(later.getTime() + WINDOW_MS),
    });
  });

  it('keeps scopes and subjects apart', async () => {
    await counter.increment(key, WINDOW_MS, NOW);

    await expect(
      counter.peek({ scope: 'sign-in:ip', subject: 'kage' }, NOW),
    ).resolves.toMatchObject({ count: 0 });
    await expect(
      counter.peek({ scope: 'sign-in:login', subject: 'kage2' }, NOW),
    ).resolves.toMatchObject({ count: 0 });
  });

  it('counts concurrent attempts without losing any', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () => counter.increment(key, WINDOW_MS, NOW)),
    );

    await expect(counter.peek(key, NOW)).resolves.toMatchObject({ count: 10 });
  });

  it('stores only an HMAC of the subject', async () => {
    await counter.increment(key, WINDOW_MS, NOW);

    const [row] = await prisma.attemptCounter.findMany();
    expect(row?.key).toHaveLength(32);
    expect(Buffer.from(row?.key ?? []).toString('latin1')).not.toContain(
      'kage',
    );
  });

  it('forgets a subject on reset', async () => {
    await counter.increment(key, WINDOW_MS, NOW);
    await counter.reset(key);

    await expect(counter.peek(key, NOW)).resolves.toMatchObject({ count: 0 });
  });
});

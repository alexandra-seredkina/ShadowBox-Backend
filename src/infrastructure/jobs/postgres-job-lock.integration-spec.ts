import { createTestPrisma } from '../../../test/support/test-database.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PostgresJobLock } from './postgres-job-lock.js';

describe('PostgresJobLock', () => {
  let first: PrismaService;
  let second: PrismaService;

  beforeAll(() => {
    first = createTestPrisma();
    second = createTestPrisma();
  });

  afterAll(async () => {
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });

  it('lets only one process run a job at a time', async () => {
    let release: () => void = () => undefined;
    const holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => undefined;
    const isInside = new Promise<void>((resolve) => {
      entered = resolve;
    });

    const running = new PostgresJobLock(first).runExclusive(
      'test.job',
      async () => {
        entered();
        await holding;
        return 'first';
      },
    );
    await isInside;
    const skipped = await new PostgresJobLock(second).runExclusive(
      'test.job',
      () => Promise.resolve('second'),
    );
    release();

    expect(skipped).toBeNull();
    await expect(running).resolves.toBe('first');
  });

  it('frees the lock when the run ends, even after a failure', async () => {
    const lock = new PostgresJobLock(first);
    await expect(
      lock.runExclusive('test.job', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    await expect(
      new PostgresJobLock(second).runExclusive('test.job', () =>
        Promise.resolve('ran'),
      ),
    ).resolves.toBe('ran');
  });

  it('keeps different jobs independent', async () => {
    await expect(
      new PostgresJobLock(first).runExclusive('job.a', () =>
        new PostgresJobLock(second).runExclusive('job.b', () =>
          Promise.resolve('both'),
        ),
      ),
    ).resolves.toBe('both');
  });
});

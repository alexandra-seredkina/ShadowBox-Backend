import {
  createTestPrisma,
  resetDatabase,
} from '../../../../test/support/test-database.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  NewPowChallenge,
  PowChallengeId,
} from '../domain/pow-challenge.js';
import { PrismaPowChallengeRepository } from './prisma-pow-challenge.repository.js';

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const newChallenge: NewPowChallenge = {
  purpose: 'register',
  prefix: Uint8Array.from({ length: 16 }, (_, index) => index),
  difficulty: 20,
  expiresAt: new Date('2026-08-27T17:10:00.123Z'),
};

describe('PrismaPowChallengeRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaPowChallengeRepository;

  beforeAll(() => {
    prisma = createTestPrisma();
    repository = new PrismaPowChallengeRepository(prisma);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('stores a challenge under a database generated UUIDv7', async () => {
    const created = await repository.create(newChallenge);

    expect(created.id).toMatch(UUID_V7);
    expect(created).toMatchObject({
      purpose: 'register',
      difficulty: 20,
      expiresAt: newChallenge.expiresAt,
    });
    expect(Buffer.from(created.prefix)).toEqual(
      Buffer.from(newChallenge.prefix),
    );
  });

  it('consumes a challenge only once', async () => {
    const created = await repository.create(newChallenge);

    const first = await repository.consume(created.id);
    const second = await repository.consume(created.id);

    expect(first?.id).toBe(created.id);
    expect(second).toBeNull();
  });

  it('returns null for an unknown challenge', async () => {
    await expect(
      repository.consume(
        '01928f3c-6b1e-7c4a-9f2d-3a8b5c6d7e8f' as PowChallengeId,
      ),
    ).resolves.toBeNull();
  });
});

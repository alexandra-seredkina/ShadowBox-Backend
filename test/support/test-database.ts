import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { createTestConfig } from './test-config.js';

export function createTestPrisma(): PrismaService {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is not set');
  }
  return new PrismaService(createTestConfig({ databaseUrl }));
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRaw`
    TRUNCATE accounts, sessions, aliases, folders, messages, known_senders,
      pow_challenges, idempotency_records, attempt_counters
    RESTART IDENTITY CASCADE`;
}

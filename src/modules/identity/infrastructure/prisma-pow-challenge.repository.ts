import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  NewPowChallenge,
  PowChallenge,
  PowChallengeId,
} from '../domain/pow-challenge.js';
import { PowChallengeRepository } from '../domain/pow-challenge.repository.js';

const RECORD_NOT_FOUND = 'P2025';

const POW_CHALLENGE_FIELDS = {
  id: true,
  purpose: true,
  prefix: true,
  difficulty: true,
  expiresAt: true,
} as const;

type PowChallengeRow = Prisma.PowChallengeGetPayload<{
  select: typeof POW_CHALLENGE_FIELDS;
}>;

function toDomain(row: PowChallengeRow): PowChallenge {
  return {
    id: row.id as PowChallengeId,
    purpose: row.purpose,
    prefix: row.prefix,
    difficulty: row.difficulty,
    expiresAt: row.expiresAt,
  };
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === RECORD_NOT_FOUND
  );
}

@Injectable()
export class PrismaPowChallengeRepository implements PowChallengeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(challenge: NewPowChallenge): Promise<PowChallenge> {
    const row = await this.prisma.powChallenge.create({
      data: {
        purpose: challenge.purpose,
        prefix: Uint8Array.from(challenge.prefix),
        difficulty: challenge.difficulty,
        expiresAt: challenge.expiresAt,
      },
      select: POW_CHALLENGE_FIELDS,
    });
    return toDomain(row);
  }

  async consume(id: PowChallengeId): Promise<PowChallenge | null> {
    try {
      const row = await this.prisma.powChallenge.delete({
        where: { id },
        select: POW_CHALLENGE_FIELDS,
      });
      return toDomain(row);
    } catch (error) {
      if (isRecordNotFound(error)) {
        return null;
      }
      throw error;
    }
  }
}

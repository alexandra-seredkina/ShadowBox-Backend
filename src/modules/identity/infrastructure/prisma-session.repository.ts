import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { AccountId } from '../domain/account.js';
import type { SessionDraft, SessionId } from '../domain/session.js';
import { SessionRepository } from '../domain/session.repository.js';
import { toSessionData } from './session-data.js';

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: AccountId, draft: SessionDraft): Promise<SessionId> {
    const row = await this.prisma.session.create({
      data: toSessionData(accountId, draft),
      select: { id: true },
    });
    return row.id as SessionId;
  }
}

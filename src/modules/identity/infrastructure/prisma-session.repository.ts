import { Injectable } from '@nestjs/common';
import type { IpHash } from '../../../shared/kernel/ip-hasher.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { AccountId } from '../domain/account.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  SESSION_IDLE_TTL_MS,
  SessionDraft,
  SessionId,
  SessionListing,
  StoredSession,
} from '../domain/session.js';
import { SessionRepository } from '../domain/session.repository.js';
import { toSessionData } from './session-data.js';

/** Mirrors isSessionExpired: within the absolute lifetime and the idle timeout. */
function liveWhere(accountId: AccountId, now: Date): Prisma.SessionWhereInput {
  return {
    accountId,
    expiresAt: { gt: now },
    lastActiveAt: { gt: new Date(now.getTime() - SESSION_IDLE_TTL_MS) },
  };
}

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

  async findByTokenHash(tokenHash: Uint8Array): Promise<StoredSession | null> {
    const row = await this.prisma.session.findUnique({
      where: { tokenHash: Uint8Array.from(tokenHash) },
      select: {
        id: true,
        accountId: true,
        ipHash: true,
        ipHashKeyVersion: true,
        isIpBound: true,
        reauthUntil: true,
        lastActiveAt: true,
        expiresAt: true,
      },
    });
    if (row === null) {
      return null;
    }
    const { ipHash, ipHashKeyVersion, ...rest } = row;
    return {
      ...rest,
      id: row.id as SessionId,
      accountId: row.accountId as AccountId,
      ip: { hash: ipHash, keyVersion: ipHashKeyVersion },
    };
  }

  async touch(id: SessionId, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id },
      data: { lastActiveAt: now },
    });
  }

  async grantReauth(
    id: SessionId,
    change: { readonly tokenHash: Uint8Array; readonly reauthUntil: Date },
  ): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: {
        tokenHash: Uint8Array.from(change.tokenHash),
        reauthUntil: change.reauthUntil,
      },
      select: { id: true },
    });
  }

  async updateIpHash(id: SessionId, ip: IpHash): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id },
      data: {
        ipHash: Uint8Array.from(ip.hash),
        ipHashKeyVersion: ip.keyVersion,
      },
    });
  }

  async delete(id: SessionId): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id } });
  }

  async deleteByTokenHash(tokenHash: Uint8Array): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { tokenHash: Uint8Array.from(tokenHash) },
    });
  }

  async listLive(accountId: AccountId, now: Date): Promise<SessionListing[]> {
    const rows = await this.prisma.session.findMany({
      where: liveWhere(accountId, now),
      select: {
        id: true,
        device: true,
        isIpBound: true,
        createdAt: true,
        lastActiveAt: true,
      },
      orderBy: [{ lastActiveAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({ ...row, id: row.id as SessionId }));
  }

  async deleteOwn(
    accountId: AccountId,
    id: SessionId,
    now: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.session.deleteMany({
      where: { ...liveWhere(accountId, now), id },
    });
    return count > 0;
  }

  async deleteAllExcept(accountId: AccountId, keep: SessionId): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { accountId, id: { not: keep } },
    });
  }
}

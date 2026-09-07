import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import {
  AttemptCounter,
  AttemptWindow,
  CounterKey,
} from '../../shared/kernel/attempt-counter.js';
import { PrismaService } from './prisma.service.js';

const DOMAIN_LABEL = 'shadowbox/attempt-counter/v1\0';

interface CounterRow {
  readonly count: number;
  readonly window_ends_at: Date;
}

@Injectable()
export class PrismaAttemptCounter implements AttemptCounter {
  private readonly key: Uint8Array;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfig,
  ) {
    this.key = config.ipHashKey;
  }

  async peek(key: CounterKey, now: Date): Promise<AttemptWindow> {
    const row = await this.prisma.attemptCounter.findFirst({
      where: { key: this.digest(key), windowEndsAt: { gt: now } },
      select: { count: true, windowEndsAt: true },
    });
    return row === null
      ? { count: 0, resetsAt: null }
      : { count: row.count, resetsAt: row.windowEndsAt };
  }

  async increment(
    key: CounterKey,
    windowMs: number,
    now: Date,
  ): Promise<AttemptWindow> {
    const windowEndsAt = new Date(now.getTime() + windowMs);
    const rows = await this.prisma.$queryRaw<CounterRow[]>`
      INSERT INTO attempt_counters (key, count, window_ends_at)
      VALUES (${this.digest(key)}, 1, ${windowEndsAt})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN attempt_counters.window_ends_at <= ${now}
          THEN 1 ELSE attempt_counters.count + 1 END,
        window_ends_at = CASE WHEN attempt_counters.window_ends_at <= ${now}
          THEN EXCLUDED.window_ends_at ELSE attempt_counters.window_ends_at END
      RETURNING count, window_ends_at`;
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Counter upsert returned no row');
    }
    return { count: row.count, resetsAt: row.window_ends_at };
  }

  async reset(key: CounterKey): Promise<void> {
    await this.prisma.attemptCounter.deleteMany({
      where: { key: this.digest(key) },
    });
  }

  private digest(key: CounterKey): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(
      createHmac('sha256', this.key)
        .update(DOMAIN_LABEL)
        .update(`${key.scope}\0${key.subject}`, 'utf8')
        .digest(),
    );
  }
}

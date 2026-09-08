import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { SkipRateLimit } from '../shared/http/rate-limit.js';
import { PrismaService } from '../infrastructure/prisma/prisma.service.js';

/** Lives outside the versioned API: /api/health. */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
@SkipRateLimit()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'up' };
  }
}

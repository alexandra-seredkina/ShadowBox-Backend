import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { OwnerId } from '../domain/alias.js';
import { LabelDirectory } from '../domain/label-directory.js';

@Injectable()
export class PrismaLabelDirectory implements LabelDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async areOwnLabels(
    ownerId: OwnerId,
    labelIds: readonly string[],
  ): Promise<boolean> {
    const wanted = new Set(labelIds);
    if (wanted.size === 0) {
      return true;
    }
    const count = await this.prisma.label.count({
      where: { id: { in: [...wanted] }, accountId: ownerId },
    });
    return count === wanted.size;
  }
}

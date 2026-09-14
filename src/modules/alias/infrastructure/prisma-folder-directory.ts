import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { OwnerId } from '../domain/alias.js';
import { FolderDirectory } from '../domain/folder-directory.js';

@Injectable()
export class PrismaFolderDirectory implements FolderDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async isOwnFolder(ownerId: OwnerId, folderId: string): Promise<boolean> {
    const count = await this.prisma.folder.count({
      where: { id: folderId, accountId: ownerId },
    });
    return count > 0;
  }
}

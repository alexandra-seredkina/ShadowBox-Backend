import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { CreateFolderHandler } from './application/create-folder.handler.js';
import { DeleteFolderHandler } from './application/delete-folder.handler.js';
import { ListFoldersHandler } from './application/list-folders.handler.js';
import { RenameFolderHandler } from './application/rename-folder.handler.js';
import { FolderRepository } from './domain/folder.repository.js';
import { PrismaFolderRepository } from './infrastructure/prisma-folder.repository.js';
import { FolderController } from './presentation/folder.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [FolderController],
  providers: [
    ListFoldersHandler,
    CreateFolderHandler,
    RenameFolderHandler,
    DeleteFolderHandler,
    { provide: FolderRepository, useClass: PrismaFolderRepository },
  ],
})
export class FolderModule {}

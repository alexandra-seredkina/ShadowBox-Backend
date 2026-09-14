import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { CreateAliasHandler } from './application/create-alias.handler.js';
import { ListAliasesHandler } from './application/list-aliases.handler.js';
import { RevokeAliasHandler } from './application/revoke-alias.handler.js';
import { UpdateAliasHandler } from './application/update-alias.handler.js';
import { AliasRepository } from './domain/alias.repository.js';
import { FolderDirectory } from './domain/folder-directory.js';
import { PrismaAliasRepository } from './infrastructure/prisma-alias.repository.js';
import { PrismaFolderDirectory } from './infrastructure/prisma-folder-directory.js';
import { AliasController } from './presentation/alias.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [AliasController],
  providers: [
    ListAliasesHandler,
    CreateAliasHandler,
    UpdateAliasHandler,
    RevokeAliasHandler,
    { provide: AliasRepository, useClass: PrismaAliasRepository },
    { provide: FolderDirectory, useClass: PrismaFolderDirectory },
  ],
})
export class AliasModule {}

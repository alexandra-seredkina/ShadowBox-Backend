import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import type { AuthenticatedSession } from '../../identity/identity.api.js';
import { CurrentSession, SessionGuard } from '../../identity/identity.api.js';
import { CreateFolderHandler } from '../application/create-folder.handler.js';
import { DeleteFolderHandler } from '../application/delete-folder.handler.js';
import { ListFoldersHandler } from '../application/list-folders.handler.js';
import { RenameFolderHandler } from '../application/rename-folder.handler.js';
import type { FolderOwnerId } from '../domain/folder.js';
import { FolderResponse, toFolderResponse } from './folder.responses.js';
import type { FolderNameRequest } from './folder.schemas.js';
import { folderNameRequestSchema, parseFolderId } from './folder.schemas.js';

function ownerOf(session: AuthenticatedSession): FolderOwnerId {
  return session.accountId as string as FolderOwnerId;
}

@Controller('folders')
@UseGuards(SessionGuard)
export class FolderController {
  constructor(
    private readonly listFolders: ListFoldersHandler,
    private readonly createFolder: CreateFolderHandler,
    private readonly renameFolder: RenameFolderHandler,
    private readonly deleteFolder: DeleteFolderHandler,
  ) {}

  @Get()
  async list(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ items: FolderResponse[] }> {
    const folders = await this.listFolders.execute(ownerOf(session));
    return { items: folders.map(toFolderResponse) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(folderNameRequestSchema))
    body: FolderNameRequest,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<FolderResponse> {
    const folder = await this.createFolder.execute({
      ownerId: ownerOf(session),
      encryptedName: body.encryptedName,
    });
    return toFolderResponse(folder);
  }

  @Patch(':id')
  async rename(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(folderNameRequestSchema))
    body: FolderNameRequest,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<FolderResponse> {
    const folder = await this.renameFolder.execute({
      ownerId: ownerOf(session),
      id: parseFolderId(id),
      encryptedName: body.encryptedName,
    });
    return toFolderResponse(folder);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await this.deleteFolder.execute({
      ownerId: ownerOf(session),
      id: parseFolderId(id),
    });
  }
}

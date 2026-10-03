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
import { CreateLabelHandler } from '../application/create-label.handler.js';
import { DeleteLabelHandler } from '../application/delete-label.handler.js';
import { ListLabelsHandler } from '../application/list-labels.handler.js';
import { RenameLabelHandler } from '../application/rename-label.handler.js';
import type { LabelOwnerId } from '../domain/label.js';
import { LabelResponse, toLabelResponse } from './label.responses.js';
import type { LabelNameRequest } from './label.schemas.js';
import { labelNameRequestSchema, parseLabelId } from './label.schemas.js';

function ownerOf(session: AuthenticatedSession): LabelOwnerId {
  return session.accountId as string as LabelOwnerId;
}

@Controller('labels')
@UseGuards(SessionGuard)
export class LabelController {
  constructor(
    private readonly listLabels: ListLabelsHandler,
    private readonly createLabel: CreateLabelHandler,
    private readonly renameLabel: RenameLabelHandler,
    private readonly deleteLabel: DeleteLabelHandler,
  ) {}

  @Get()
  async list(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ items: LabelResponse[] }> {
    const labels = await this.listLabels.execute(ownerOf(session));
    return { items: labels.map(toLabelResponse) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(labelNameRequestSchema)) body: LabelNameRequest,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<LabelResponse> {
    const label = await this.createLabel.execute({
      ownerId: ownerOf(session),
      encryptedName: body.encryptedName,
    });
    return toLabelResponse(label);
  }

  @Patch(':id')
  async rename(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(labelNameRequestSchema)) body: LabelNameRequest,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<LabelResponse> {
    const label = await this.renameLabel.execute({
      ownerId: ownerOf(session),
      id: parseLabelId(id),
      encryptedName: body.encryptedName,
    });
    return toLabelResponse(label);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await this.deleteLabel.execute({
      ownerId: ownerOf(session),
      id: parseLabelId(id),
    });
  }
}

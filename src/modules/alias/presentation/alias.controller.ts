import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IDEMPOTENCY_KEY_HEADER,
  parseIdempotencyKey,
} from '../../../shared/http/idempotency-key.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import type { AuthenticatedSession } from '../../identity/identity.api.js';
import { CurrentSession, SessionGuard } from '../../identity/identity.api.js';
import { CreateAliasHandler } from '../application/create-alias.handler.js';
import { ListAliasesHandler } from '../application/list-aliases.handler.js';
import { RevokeAliasHandler } from '../application/revoke-alias.handler.js';
import { UpdateAliasHandler } from '../application/update-alias.handler.js';
import type { OwnerId } from '../domain/alias.js';
import { AliasResponse, toAliasResponse } from './alias.responses.js';
import type {
  CreateAliasRequest,
  ListAliasesQuery,
  UpdateAliasRequest,
} from './alias.schemas.js';
import {
  createAliasRequestSchema,
  listAliasesQuerySchema,
  parseAliasId,
  updateAliasRequestSchema,
} from './alias.schemas.js';

function ownerOf(session: AuthenticatedSession): OwnerId {
  return session.accountId as string as OwnerId;
}

@Controller('aliases')
@UseGuards(SessionGuard)
export class AliasController {
  constructor(
    private readonly listAliases: ListAliasesHandler,
    private readonly createAlias: CreateAliasHandler,
    private readonly updateAlias: UpdateAliasHandler,
    private readonly revokeAlias: RevokeAliasHandler,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listAliasesQuerySchema))
    query: ListAliasesQuery,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ items: AliasResponse[] }> {
    const aliases = await this.listAliases.execute({
      ownerId: ownerOf(session),
      status: query.status ?? null,
    });
    return { items: aliases.map(toAliasResponse) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createAliasRequestSchema))
    body: CreateAliasRequest,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<AliasResponse> {
    const alias = await this.createAlias.execute({
      ownerId: ownerOf(session),
      lifetime:
        body.kind === 'temporary'
          ? { kind: 'temporary', ttl: body.ttl }
          : { kind: 'permanent' },
      encryptedLabel: body.encryptedLabel,
      folderId: body.folderId,
      labelIds: body.labelIds,
      idempotencyKey: parseIdempotencyKey(idempotencyKey),
    });
    return toAliasResponse(alias);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAliasRequestSchema))
    body: UpdateAliasRequest,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<AliasResponse> {
    const alias = await this.updateAlias.execute({
      ownerId: ownerOf(session),
      id: parseAliasId(id),
      changes: body,
    });
    return toAliasResponse(alias);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param('id') id: string,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await this.revokeAlias.execute({
      ownerId: ownerOf(session),
      id: parseAliasId(id),
      reauthUntil: session.reauthUntil,
    });
  }
}

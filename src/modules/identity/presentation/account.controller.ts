import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import type { AuthenticatedSession } from '../application/authenticate-session.handler.js';
import { ChangeIpBindingHandler } from '../application/change-ip-binding.handler.js';
import { DeleteAccountHandler } from '../application/delete-account.handler.js';
import { EndOtherSessionsHandler } from '../application/end-other-sessions.handler.js';
import { EndOwnSessionHandler } from '../application/end-own-session.handler.js';
import { ListSessionsHandler } from '../application/list-sessions.handler.js';
import { LoadAccountHandler } from '../application/load-account.handler.js';
import type { SessionId } from '../domain/session.js';
import {
  AccountResponse,
  SessionResponse,
  toAccountResponse,
  toSessionResponse,
} from './auth.responses.js';
import { clientContextOf } from './client-context.js';
import { clearSessionCookie } from './session-cookie.js';
import { CurrentSession, SessionGuard } from './session.guard.js';

const settingsRequestSchema = z.strictObject({ ipBinding: z.boolean() });
type SettingsRequest = z.infer<typeof settingsRequestSchema>;

const sessionIdSchema = z.uuid();

function parseSessionId(raw: string): SessionId {
  if (!sessionIdSchema.safeParse(raw).success) {
    throw new NotFoundError();
  }
  return raw as SessionId;
}

@Controller('account')
@UseGuards(SessionGuard)
export class AccountController {
  constructor(
    private readonly loadAccount: LoadAccountHandler,
    private readonly changeIpBinding: ChangeIpBindingHandler,
    private readonly deleteAccount: DeleteAccountHandler,
  ) {}

  @Get()
  async get(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<AccountResponse> {
    return toAccountResponse(await this.loadAccount.execute(session));
  }

  @Patch('settings')
  async updateSettings(
    @Body(new ZodValidationPipe(settingsRequestSchema)) body: SettingsRequest,
    @CurrentSession() session: AuthenticatedSession,
    @Req() request: Request,
  ): Promise<AccountResponse> {
    const account = await this.changeIpBinding.execute({
      current: session,
      isEnabled: body.ipBinding,
      ip: clientContextOf(request).ip,
    });
    return toAccountResponse(account);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentSession() session: AuthenticatedSession,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.deleteAccount.execute(session);
    clearSessionCookie(response);
  }
}

@Controller('sessions')
@UseGuards(SessionGuard)
export class SessionsController {
  constructor(
    private readonly listSessions: ListSessionsHandler,
    private readonly endOwnSession: EndOwnSessionHandler,
    private readonly endOtherSessions: EndOtherSessionsHandler,
  ) {}

  @Get()
  async list(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ items: SessionResponse[] }> {
    const sessions = await this.listSessions.execute(session);
    return { items: sessions.map(toSessionResponse) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async end(
    @Param('id') id: string,
    @CurrentSession() session: AuthenticatedSession,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const wasCurrent = await this.endOwnSession.execute({
      current: session,
      id: parseSessionId(id),
    });
    if (wasCurrent) {
      clearSessionCookie(response);
    }
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async endOthers(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    await this.endOtherSessions.execute(session);
  }
}

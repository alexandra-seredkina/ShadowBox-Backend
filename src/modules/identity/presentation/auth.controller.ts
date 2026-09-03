import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  IDEMPOTENCY_KEY_HEADER,
  parseIdempotencyKey,
} from '../../../shared/http/idempotency-key.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { IssuePowChallengeHandler } from '../application/issue-pow-challenge.handler.js';
import { LoadKdfParamsHandler } from '../application/load-kdf-params.handler.js';
import { RegisterAccountHandler } from '../application/register-account.handler.js';
import {
  PowChallengeResponse,
  PreloginResponse,
  RegisterResponse,
  toKdfParamsResponse,
  toPowChallengeResponse,
  toRegisterResponse,
} from './auth.responses.js';
import type {
  PowRequest,
  PreloginRequest,
  RegisterRequest,
} from './auth.schemas.js';
import {
  powRequestSchema,
  preloginRequestSchema,
  registerRequestSchema,
} from './auth.schemas.js';
import { clientContextOf } from './client-context.js';
import { setSessionCookie } from './session-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly issuePowChallenge: IssuePowChallengeHandler,
    private readonly loadKdfParams: LoadKdfParamsHandler,
    private readonly registerAccount: RegisterAccountHandler,
  ) {}

  @Post('pow')
  @HttpCode(HttpStatus.OK)
  async pow(
    @Body(new ZodValidationPipe(powRequestSchema)) body: PowRequest,
  ): Promise<PowChallengeResponse> {
    const challenge = await this.issuePowChallenge.execute(body);
    return toPowChallengeResponse(challenge);
  }

  @Post('prelogin')
  @HttpCode(HttpStatus.OK)
  async prelogin(
    @Body(new ZodValidationPipe(preloginRequestSchema)) body: PreloginRequest,
  ): Promise<PreloginResponse> {
    const kdf = await this.loadKdfParams.execute(body);
    return { kdf: toKdfParamsResponse(kdf) };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RegisterResponse> {
    const { result, sessionToken } = await this.registerAccount.execute({
      login: body.login,
      authKey: body.authKey,
      kdfSalt: body.kdf.salt,
      ...body.keys,
      pow: body.pow,
      idempotencyKey: parseIdempotencyKey(idempotencyKey),
      client: clientContextOf(request),
    });
    setSessionCookie(response, sessionToken);
    return toRegisterResponse(result);
  }
}

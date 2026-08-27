import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { IssuePowChallengeHandler } from '../application/issue-pow-challenge.handler.js';
import { LoadKdfParamsHandler } from '../application/load-kdf-params.handler.js';
import {
  PowChallengeResponse,
  PreloginResponse,
  toKdfParamsResponse,
  toPowChallengeResponse,
} from './auth.responses.js';
import type { PowRequest, PreloginRequest } from './auth.schemas.js';
import { powRequestSchema, preloginRequestSchema } from './auth.schemas.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly issuePowChallenge: IssuePowChallengeHandler,
    private readonly loadKdfParams: LoadKdfParamsHandler,
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
}

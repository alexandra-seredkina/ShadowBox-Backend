import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  IDEMPOTENCY_KEY_HEADER,
  parseIdempotencyKey,
} from '../../../shared/http/idempotency-key.js';
import { RateLimit } from '../../../shared/http/rate-limit.js';
import { readSessionCookie } from '../../../shared/http/session-cookie.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import type { AuthenticatedSession } from '../application/authenticate-session.handler.js';
import { EndSessionHandler } from '../application/end-session.handler.js';
import { IssuePowChallengeHandler } from '../application/issue-pow-challenge.handler.js';
import { LoadKdfParamsHandler } from '../application/load-kdf-params.handler.js';
import { LoadSessionStateHandler } from '../application/load-session-state.handler.js';
import { ReauthenticateHandler } from '../application/reauthenticate.handler.js';
import { RegisterAccountHandler } from '../application/register-account.handler.js';
import { SignInHandler } from '../application/sign-in.handler.js';
import {
  PowChallengeResponse,
  PreloginResponse,
  RegisterResponse,
  SessionStateResponse,
  SignInResponse,
  toKdfParamsResponse,
  toPowChallengeResponse,
  toRegisterResponse,
  toSessionStateResponse,
  toSignInResponse,
} from './auth.responses.js';
import type {
  PowRequest,
  PreloginRequest,
  ReauthRequest,
  RegisterRequest,
  SignInRequest,
} from './auth.schemas.js';
import {
  powRequestSchema,
  preloginRequestSchema,
  reauthRequestSchema,
  registerRequestSchema,
  signInRequestSchema,
} from './auth.schemas.js';
import { clientContextOf } from './client-context.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';
import { CurrentSession, SessionGuard } from './session.guard.js';

const MINUTE_MS = 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly issuePowChallenge: IssuePowChallengeHandler,
    private readonly loadKdfParams: LoadKdfParamsHandler,
    private readonly registerAccount: RegisterAccountHandler,
    private readonly signIn: SignInHandler,
    private readonly endSession: EndSessionHandler,
    private readonly loadSessionState: LoadSessionStateHandler,
    private readonly reauthenticate: ReauthenticateHandler,
  ) {}

  @Post('pow')
  @RateLimit({ scope: 'auth.pow', limit: 10, windowMs: MINUTE_MS, per: 'ip' })
  @HttpCode(HttpStatus.OK)
  async pow(
    @Body(new ZodValidationPipe(powRequestSchema)) body: PowRequest,
  ): Promise<PowChallengeResponse> {
    const challenge = await this.issuePowChallenge.execute(body);
    return toPowChallengeResponse(challenge);
  }

  @Post('prelogin')
  @RateLimit({
    scope: 'auth.prelogin',
    limit: 20,
    windowMs: MINUTE_MS,
    per: 'ip',
  })
  @HttpCode(HttpStatus.OK)
  async prelogin(
    @Body(new ZodValidationPipe(preloginRequestSchema)) body: PreloginRequest,
  ): Promise<PreloginResponse> {
    const kdf = await this.loadKdfParams.execute(body);
    return { kdf: toKdfParamsResponse(kdf) };
  }

  @Post('register')
  @RateLimit({
    scope: 'auth.register',
    limit: 3, // Tunable via REGISTER_RATE_LIMIT_PER_HOUR env (requires restart)
    windowMs: 60 * MINUTE_MS,
    per: 'ip',
  })
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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(signInRequestSchema)) body: SignInRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SignInResponse> {
    const outcome = await this.signIn.execute({
      login: body.login,
      authKey: body.authKey,
      pow: body.pow ?? null,
      client: clientContextOf(request),
    });
    setSessionCookie(response, outcome.sessionToken);
    return toSignInResponse(outcome);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.endSession.execute(readSessionCookie(request));
    clearSessionCookie(response);
  }

  @Get('session')
  @UseGuards(SessionGuard)
  async session(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<SessionStateResponse> {
    return toSessionStateResponse(await this.loadSessionState.execute(session));
  }

  @Post('reauth')
  @RateLimit({
    scope: 'auth.reauth',
    limit: 5,
    windowMs: 15 * MINUTE_MS,
    per: 'session',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async reauth(
    @Body(new ZodValidationPipe(reauthRequestSchema)) body: ReauthRequest,
    @CurrentSession() session: AuthenticatedSession,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = await this.reauthenticate.execute({
      session,
      authKey: body.authKey,
    });
    setSessionCookie(response, token);
  }
}

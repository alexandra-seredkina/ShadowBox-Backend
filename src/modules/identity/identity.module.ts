import { Module } from '@nestjs/common';
import { AuthenticateSessionHandler } from './application/authenticate-session.handler.js';
import { EndSessionHandler } from './application/end-session.handler.js';
import { IssuePowChallengeHandler } from './application/issue-pow-challenge.handler.js';
import { LoadKdfParamsHandler } from './application/load-kdf-params.handler.js';
import { LoadSessionStateHandler } from './application/load-session-state.handler.js';
import { PowVerifier } from './application/pow-verifier.js';
import { ReauthenticateHandler } from './application/reauthenticate.handler.js';
import { RegisterAccountHandler } from './application/register-account.handler.js';
import { SessionIssuer } from './application/session-issuer.js';
import { SignInHandler } from './application/sign-in.handler.js';
import { AccountKdfRepository } from './domain/account-kdf.repository.js';
import { AccountRepository } from './domain/account.repository.js';
import { AccountRegistrar } from './domain/account-registrar.js';
import { AuthKeyHasher } from './domain/auth-key-hasher.js';
import { DecoySaltSource } from './domain/decoy-salt.source.js';
import { PowChallengeRepository } from './domain/pow-challenge.repository.js';
import { PowDifficultyPolicy } from './domain/pow-difficulty.policy.js';
import { SessionRepository } from './domain/session.repository.js';
import { ConfiguredPowDifficultyPolicy } from './infrastructure/configured-pow-difficulty.policy.js';
import { HmacDecoySaltSource } from './infrastructure/hmac-decoy-salt.source.js';
import { PrismaAccountKdfRepository } from './infrastructure/prisma-account-kdf.repository.js';
import { PrismaAccountRegistrar } from './infrastructure/prisma-account-registrar.js';
import { PrismaAccountRepository } from './infrastructure/prisma-account.repository.js';
import { PrismaPowChallengeRepository } from './infrastructure/prisma-pow-challenge.repository.js';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository.js';
import { SodiumAuthKeyHasher } from './infrastructure/sodium-auth-key-hasher.js';
import { AuthController } from './presentation/auth.controller.js';
import { SessionGuard } from './presentation/session.guard.js';

@Module({
  controllers: [AuthController],
  providers: [
    IssuePowChallengeHandler,
    LoadKdfParamsHandler,
    RegisterAccountHandler,
    SignInHandler,
    EndSessionHandler,
    LoadSessionStateHandler,
    ReauthenticateHandler,
    AuthenticateSessionHandler,
    SessionGuard,
    PowVerifier,
    SessionIssuer,
    { provide: PowChallengeRepository, useClass: PrismaPowChallengeRepository },
    { provide: AccountKdfRepository, useClass: PrismaAccountKdfRepository },
    { provide: AccountRepository, useClass: PrismaAccountRepository },
    { provide: AccountRegistrar, useClass: PrismaAccountRegistrar },
    { provide: SessionRepository, useClass: PrismaSessionRepository },
    { provide: AuthKeyHasher, useClass: SodiumAuthKeyHasher },
    { provide: DecoySaltSource, useClass: HmacDecoySaltSource },
    { provide: PowDifficultyPolicy, useClass: ConfiguredPowDifficultyPolicy },
  ],
  /** Other modules protect their routes with SessionGuard and CurrentSession. */
  exports: [AuthenticateSessionHandler, SessionGuard],
})
export class IdentityModule {}

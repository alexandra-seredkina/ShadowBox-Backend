import { Module } from '@nestjs/common';
import { IssuePowChallengeHandler } from './application/issue-pow-challenge.handler.js';
import { LoadKdfParamsHandler } from './application/load-kdf-params.handler.js';
import { AccountKdfRepository } from './domain/account-kdf.repository.js';
import { DecoySaltSource } from './domain/decoy-salt.source.js';
import { PowChallengeRepository } from './domain/pow-challenge.repository.js';
import { PowDifficultyPolicy } from './domain/pow-difficulty.policy.js';
import { ConfiguredPowDifficultyPolicy } from './infrastructure/configured-pow-difficulty.policy.js';
import { HmacDecoySaltSource } from './infrastructure/hmac-decoy-salt.source.js';
import { PrismaAccountKdfRepository } from './infrastructure/prisma-account-kdf.repository.js';
import { PrismaPowChallengeRepository } from './infrastructure/prisma-pow-challenge.repository.js';
import { AuthController } from './presentation/auth.controller.js';

@Module({
  controllers: [AuthController],
  providers: [
    IssuePowChallengeHandler,
    LoadKdfParamsHandler,
    { provide: PowChallengeRepository, useClass: PrismaPowChallengeRepository },
    { provide: AccountKdfRepository, useClass: PrismaAccountKdfRepository },
    { provide: DecoySaltSource, useClass: HmacDecoySaltSource },
    { provide: PowDifficultyPolicy, useClass: ConfiguredPowDifficultyPolicy },
  ],
})
export class IdentityModule {}

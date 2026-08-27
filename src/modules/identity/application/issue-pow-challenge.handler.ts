import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import { SecureRandom } from '../../../shared/kernel/secure-random.js';
import {
  createPowChallenge,
  POW_PREFIX_BYTES,
  PowChallenge,
  PowPurpose,
} from '../domain/pow-challenge.js';
import { PowChallengeRepository } from '../domain/pow-challenge.repository.js';
import { PowDifficultyPolicy } from '../domain/pow-difficulty.policy.js';

export interface IssuePowChallengeCommand {
  readonly purpose: PowPurpose;
}

@Injectable()
export class IssuePowChallengeHandler {
  constructor(
    private readonly challenges: PowChallengeRepository,
    private readonly difficulty: PowDifficultyPolicy,
    private readonly random: SecureRandom,
    private readonly clock: Clock,
  ) {}

  async execute(command: IssuePowChallengeCommand): Promise<PowChallenge> {
    const challenge = createPowChallenge({
      purpose: command.purpose,
      prefix: this.random.bytes(POW_PREFIX_BYTES),
      difficulty: this.difficulty.difficultyFor(command.purpose),
      now: this.clock.now(),
    });
    return this.challenges.create(challenge);
  }
}

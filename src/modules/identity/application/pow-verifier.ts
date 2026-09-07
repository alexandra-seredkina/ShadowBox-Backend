import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import { PowInvalidError } from '../domain/identity.errors.js';
import {
  isPowSolution,
  PowChallengeId,
  PowPurpose,
} from '../domain/pow-challenge.js';
import { PowChallengeRepository } from '../domain/pow-challenge.repository.js';

export interface PowSolution {
  readonly challengeId: string;
  readonly nonce: string;
}

/** Consumes the challenge first, so a solution is checked at most once. */
@Injectable()
export class PowVerifier {
  constructor(
    private readonly challenges: PowChallengeRepository,
    private readonly clock: Clock,
  ) {}

  async verify(solution: PowSolution, purpose: PowPurpose): Promise<void> {
    const challenge = await this.challenges.consume(
      solution.challengeId as PowChallengeId,
    );
    const attempt = { purpose, nonce: solution.nonce, now: this.clock.now() };
    if (challenge === null || !isPowSolution(challenge, attempt)) {
      throw new PowInvalidError();
    }
  }
}

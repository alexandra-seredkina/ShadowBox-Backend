import type {
  NewPowChallenge,
  PowChallenge,
  PowChallengeId,
} from './pow-challenge.js';

export abstract class PowChallengeRepository {
  abstract create(challenge: NewPowChallenge): Promise<PowChallenge>;

  /** Deletes and returns the challenge, so each one is checked at most once. */
  abstract consume(id: PowChallengeId): Promise<PowChallenge | null>;
}

import type { PowPurpose } from './pow-challenge.js';

/** Difficulty is expected to adapt to load later (D-019). */
export abstract class PowDifficultyPolicy {
  abstract difficultyFor(purpose: PowPurpose): number;
}

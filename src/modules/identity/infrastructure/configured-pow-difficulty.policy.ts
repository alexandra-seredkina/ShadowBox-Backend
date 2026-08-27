import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import { PowDifficultyPolicy } from '../domain/pow-difficulty.policy.js';

@Injectable()
export class ConfiguredPowDifficultyPolicy implements PowDifficultyPolicy {
  private readonly difficulty: number;

  constructor(config: AppConfig) {
    this.difficulty = config.powDifficulty;
  }

  difficultyFor(): number {
    return this.difficulty;
  }
}

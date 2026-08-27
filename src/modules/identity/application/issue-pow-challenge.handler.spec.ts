import {
  FixedClock,
  SequentialRandom,
} from '../../../../test/support/kernel-fakes.js';
import { InMemoryPowChallengeRepository } from '../../../../test/support/identity-fakes.js';
import { POW_TTL_MS } from '../domain/pow-challenge.js';
import { PowDifficultyPolicy } from '../domain/pow-difficulty.policy.js';
import { IssuePowChallengeHandler } from './issue-pow-challenge.handler.js';

const NOW = new Date('2026-08-27T17:05:00Z');

class FixedDifficulty implements PowDifficultyPolicy {
  difficultyFor(): number {
    return 20;
  }
}

describe('IssuePowChallengeHandler', () => {
  let challenges: InMemoryPowChallengeRepository;
  let handler: IssuePowChallengeHandler;

  beforeEach(() => {
    challenges = new InMemoryPowChallengeRepository();
    handler = new IssuePowChallengeHandler(
      challenges,
      new FixedDifficulty(),
      new SequentialRandom(),
      new FixedClock(NOW),
    );
  });

  it('stores a challenge for the requested purpose', async () => {
    const challenge = await handler.execute({ purpose: 'login' });

    expect(challenges.saved.get(challenge.id)).toEqual(challenge);
    expect(challenge).toMatchObject({
      purpose: 'login',
      difficulty: 20,
      expiresAt: new Date(NOW.getTime() + POW_TTL_MS),
    });
  });

  it('uses a fresh random prefix for every challenge', async () => {
    const first = await handler.execute({ purpose: 'register' });
    const second = await handler.execute({ purpose: 'register' });

    expect(first.prefix).toHaveLength(16);
    expect(second.prefix).not.toEqual(first.prefix);
  });
});

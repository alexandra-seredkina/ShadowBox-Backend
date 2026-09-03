import { SecureRandom } from './secure-random.js';
import {
  ALIAS_LOCAL_PART_LENGTH,
  generateAliasLocalPart,
} from './alias-local-part.js';

class ScriptedRandom implements SecureRandom {
  constructor(private readonly batches: readonly number[][]) {}

  private call = 0;

  bytes(length: number): Uint8Array {
    const batch = this.batches[this.call] ?? [];
    this.call += 1;
    return Uint8Array.from({ length }, (_, index) => batch[index] ?? 255);
  }
}

describe('generateAliasLocalPart', () => {
  it('maps random bytes onto [a-z0-9]', () => {
    const random = new ScriptedRandom([[0, 25, 26, 35, 36, 71, 1, 2, 3, 4]]);

    expect(generateAliasLocalPart(random)).toBe('az09a9bcde');
  });

  it('skips bytes that would bias the alphabet and draws again', () => {
    const random = new ScriptedRandom([
      [252, 253, 0],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    ]);

    expect(generateAliasLocalPart(random)).toBe('abcdefghij');
  });

  it('produces ten lower-case characters from real randomness', () => {
    const random: SecureRandom = {
      bytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    };

    expect(generateAliasLocalPart(random)).toMatch(
      new RegExp(`^[a-z0-9]{${ALIAS_LOCAL_PART_LENGTH}}$`),
    );
  });
});

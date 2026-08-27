import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import { parseLogin } from './login.js';

function issueOf(raw: string): string | undefined {
  try {
    parseLogin(raw);
    return undefined;
  } catch (error) {
    if (!(error instanceof ValidationFailedError)) {
      throw error;
    }
    return error.details[0]?.issue;
  }
}

describe('parseLogin', () => {
  it.each([
    ['kage', 'kage'],
    ['Kage', 'kage'],
    ['ＫＡＧＥ', 'kage'],
    ['k.a_g-e', 'k.a_g-e'],
    ['_kage_', '_kage_'],
    ['a'.repeat(32), 'a'.repeat(32)],
  ])('normalizes %j to %j', (raw, expected) => {
    expect(parseLogin(raw)).toBe(expected);
  });

  it.each([
    ['ab', 'too_short'],
    ['a'.repeat(33), 'too_long'],
    ['.kage', 'invalid_format'],
    ['kage.', 'invalid_format'],
    ['-kage', 'invalid_format'],
    ['kage-', 'invalid_format'],
    ['ka ge', 'invalid_format'],
    ['кейдж', 'invalid_format'],
    ['kаge', 'invalid_format'],
    ['kage@box', 'invalid_format'],
  ])('rejects %j as %s', (raw, issue) => {
    expect(issueOf(raw)).toBe(issue);
  });

  it('reports the login field in the error details', () => {
    expect(() => parseLogin('x')).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        details: [{ path: 'login', issue: 'too_short' }],
      }),
    );
  });
});

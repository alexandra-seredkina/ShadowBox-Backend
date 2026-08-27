import { z } from 'zod';
import { ValidationFailedError } from '../errors/validation-failed.error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const pipe = new ZodValidationPipe(
  z.strictObject({
    login: z.string().min(3).max(8),
    purpose: z.enum(['register', 'login']),
    nested: z.strictObject({ count: z.number() }).optional(),
  }),
);

function detailsOf(value: unknown): unknown {
  try {
    pipe.transform(value);
    return undefined;
  } catch (error) {
    if (!(error instanceof ValidationFailedError)) {
      throw error;
    }
    return error.details;
  }
}

describe('ZodValidationPipe', () => {
  it('returns parsed data for a valid body', () => {
    expect(pipe.transform({ login: 'kage', purpose: 'login' })).toEqual({
      login: 'kage',
      purpose: 'login',
    });
  });

  it('names missing fields as required', () => {
    expect(detailsOf({ purpose: 'login' })).toEqual([
      { path: 'login', issue: 'required' },
    ]);
  });

  it('names a missing enum field as required', () => {
    expect(detailsOf({ login: 'kage' })).toEqual([
      { path: 'purpose', issue: 'required' },
    ]);
  });

  it('maps string length issues', () => {
    expect(detailsOf({ login: 'ab', purpose: 'login' })).toEqual([
      { path: 'login', issue: 'too_short' },
    ]);
    expect(detailsOf({ login: 'abcdefghi', purpose: 'login' })).toEqual([
      { path: 'login', issue: 'too_long' },
    ]);
  });

  it('reports each unknown field, including nested ones', () => {
    expect(
      detailsOf({
        login: 'kage',
        purpose: 'login',
        extra: 1,
        nested: { count: 1, x: 2 },
      }),
    ).toEqual(
      expect.arrayContaining([
        { path: 'extra', issue: 'unknown_field' },
        { path: 'nested.x', issue: 'unknown_field' },
      ]),
    );
  });

  it('reports an invalid enum value and a wrong type', () => {
    expect(detailsOf({ login: 1, purpose: 'send' })).toEqual([
      { path: 'login', issue: 'invalid_type' },
      { path: 'purpose', issue: 'invalid_value' },
    ]);
  });

  it('rejects a missing body', () => {
    expect(detailsOf(undefined)).toEqual([{ path: '', issue: 'required' }]);
  });
});

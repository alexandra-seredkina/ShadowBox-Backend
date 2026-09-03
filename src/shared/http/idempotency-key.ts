import { z } from 'zod';
import { ValidationFailedError } from '../errors/validation-failed.error.js';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

const keySchema = z.uuid();

/** The header is optional; a present but malformed one is a validation error. */
export function parseIdempotencyKey(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (!keySchema.safeParse(value).success) {
    throw new ValidationFailedError([
      { path: 'Idempotency-Key', issue: 'invalid_format' },
    ]);
  }
  return value;
}

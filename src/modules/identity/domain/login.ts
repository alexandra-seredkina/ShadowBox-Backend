import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import type { Brand } from '../../../shared/kernel/brand.js';

/** NFKC + lower-case form, the only form that is stored or compared. */
export type Login = Brand<string, 'Login'>;

export const LOGIN_MIN_LENGTH = 3;
export const LOGIN_MAX_LENGTH = 32;

/** `[a-z0-9._-]`, not starting or ending with `.` or `-`. */
const LOGIN_PATTERN = /^[a-z0-9_](?:[a-z0-9._-]*[a-z0-9_])?$/;

function findLoginIssue(normalized: string): string | null {
  if (normalized.length < LOGIN_MIN_LENGTH) {
    return 'too_short';
  }
  if (normalized.length > LOGIN_MAX_LENGTH) {
    return 'too_long';
  }
  return LOGIN_PATTERN.test(normalized) ? null : 'invalid_format';
}

export function parseLogin(raw: string): Login {
  const normalized = raw.normalize('NFKC').toLowerCase();
  const issue = findLoginIssue(normalized);
  if (issue !== null) {
    throw new ValidationFailedError([{ path: 'login', issue }]);
  }
  return normalized as Login;
}

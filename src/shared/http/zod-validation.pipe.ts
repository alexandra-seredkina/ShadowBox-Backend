import { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import {
  ValidationFailedError,
  ValidationIssue,
} from '../errors/validation-failed.error.js';

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let current = input;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

/** Issue names are part of the API contract, so zod codes are translated. */
function toIssueName(issue: z.core.$ZodIssue, input: unknown): string {
  if (valueAt(input, issue.path) === undefined) {
    return 'required';
  }
  switch (issue.code) {
    case 'too_small':
      return issue.origin === 'string' ? 'too_short' : 'too_small';
    case 'too_big':
      return issue.origin === 'string' ? 'too_long' : 'too_big';
    case 'invalid_type':
      return 'invalid_type';
    case 'invalid_value':
    case 'invalid_union':
      return 'invalid_value';
    default:
      return 'invalid_format';
  }
}

function toValidationIssues(
  error: z.ZodError,
  input: unknown,
): ValidationIssue[] {
  return error.issues.flatMap((issue): ValidationIssue[] => {
    const path = issue.path.join('.');
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: path === '' ? key : `${path}.${key}`,
        issue: 'unknown_field',
      }));
    }
    return [{ path, issue: toIssueName(issue, input) }];
  });
}

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationFailedError(toValidationIssues(result.error, value));
    }
    return result.data;
  }
}

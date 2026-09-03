export const DOMAIN_ERROR_KINDS = [
  'invalid_input',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'rule_violation',
  'locked',
  'precondition_required',
  'rate_limited',
] as const;

export type DomainErrorKind = (typeof DOMAIN_ERROR_KINDS)[number];

/**
 * Base for every expected failure. `code` is the machine-readable value from
 * the API contract; `kind` lets the presentation layer pick an HTTP status
 * without the domain knowing about HTTP.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

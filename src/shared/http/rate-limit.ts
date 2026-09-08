import { Reflector } from '@nestjs/core';

const MINUTE_MS = 60 * 1000;

export interface RateLimitRule {
  /** Routes sharing a scope share one budget. */
  readonly scope: string;
  readonly limit: number;
  readonly windowMs: number;
  /** `session` counts by the session cookie and falls back to the IP without one. */
  readonly per: 'ip' | 'session';
}

/** Every route without its own rule: 300 requests a minute per session. */
export const DEFAULT_RATE_LIMIT: RateLimitRule = {
  scope: 'api',
  limit: 300,
  windowMs: MINUTE_MS,
  per: 'session',
};

export const RateLimit = Reflector.createDecorator<RateLimitRule>();

/** Only for operational endpoints such as the health check. */
export const SkipRateLimit = Reflector.createDecorator<true>({
  transform: () => true,
});

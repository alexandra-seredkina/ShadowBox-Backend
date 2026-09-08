import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RateLimitedError } from '../../shared/errors/rate-limited.error.js';
import {
  DEFAULT_RATE_LIMIT,
  RateLimit,
  RateLimitRule,
  SkipRateLimit,
} from '../../shared/http/rate-limit.js';
import { readSessionCookie } from '../../shared/http/session-cookie.js';
import {
  AttemptCounter,
  CounterKey,
  secondsUntil,
} from '../../shared/kernel/attempt-counter.js';
import { Clock } from '../../shared/kernel/clock.js';

/**
 * Application-level limits next to the coarse ones in nginx. Counters are
 * keyed by an HMAC of the IP or the session cookie, never the value itself.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly counter: AttemptCounter,
    private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride(SkipRateLimit, targets) === true) {
      return true;
    }
    const rule =
      this.reflector.getAllAndOverride(RateLimit, targets) ??
      DEFAULT_RATE_LIMIT;
    const request = context.switchToHttp().getRequest<Request>();
    const now = this.clock.now();
    const window = await this.counter.increment(
      counterKeyFor(rule, request),
      rule.windowMs,
      now,
    );
    if (window.count > rule.limit) {
      throw new RateLimitedError(secondsUntil(window.resetsAt, now));
    }
    return true;
  }
}

function counterKeyFor(rule: RateLimitRule, request: Request): CounterKey {
  const scope = `rate:${rule.scope}`;
  const session = rule.per === 'session' ? readSessionCookie(request) : null;
  if (session !== null) {
    return { scope, subject: `session:${session}` };
  }
  const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
  return { scope, subject: `ip:${ip}` };
}

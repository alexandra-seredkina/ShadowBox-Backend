import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../../config/app-config.js';
import { DomainError } from '../../shared/errors/domain-error.js';

export class OriginMismatchError extends DomainError {
  readonly code = 'ORIGIN_MISMATCH';
  readonly kind = 'forbidden';

  constructor() {
    super('Origin is not allowed');
  }
}

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence next to SameSite=Strict: browsers always send Origin on
 * mutating requests, so a missing header is rejected as well.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(config: AppConfig) {
    this.allowedOrigins = new Set(config.allowedOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }
    const origin = request.headers.origin;
    if (origin === undefined || !this.allowedOrigins.has(origin)) {
      throw new OriginMismatchError();
    }
    return true;
  }
}

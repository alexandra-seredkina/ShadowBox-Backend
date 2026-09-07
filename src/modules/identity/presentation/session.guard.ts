import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AuthenticatedSession,
  AuthenticateSessionHandler,
} from '../application/authenticate-session.handler.js';
import { UnauthenticatedError } from '../domain/identity.errors.js';
import { clientContextOf } from './client-context.js';
import { clearSessionCookie, readSessionCookie } from './session-cookie.js';

const sessionsByRequest = new WeakMap<Request, AuthenticatedSession>();

/** Lets a route through only with a live session; a dead cookie is cleared on the way out. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authenticate: AuthenticateSessionHandler) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    try {
      const session = await this.authenticate.execute({
        token: readSessionCookie(request),
        ip: clientContextOf(request).ip,
      });
      sessionsByRequest.set(request, session);
      return true;
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        clearSessionCookie(http.getResponse<Response>());
      }
      throw error;
    }
  }
}

/** The session resolved by SessionGuard; using it on an unguarded route is a bug. */
export const CurrentSession = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedSession => {
    const session = sessionsByRequest.get(
      context.switchToHttp().getRequest<Request>(),
    );
    if (session === undefined) {
      throw new Error('CurrentSession used on a route without SessionGuard');
    }
    return session;
  },
);

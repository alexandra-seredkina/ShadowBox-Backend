import type { CookieOptions, Response } from 'express';
import { SESSION_COOKIE } from '../../../shared/http/session-cookie.js';
import { SESSION_ABSOLUTE_TTL_MS } from '../domain/session.js';

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
};

export function setSessionCookie(response: Response, token: Uint8Array): void {
  response.cookie(SESSION_COOKIE, Buffer.from(token).toString('base64url'), {
    ...COOKIE_OPTIONS,
    maxAge: SESSION_ABSOLUTE_TTL_MS,
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
}

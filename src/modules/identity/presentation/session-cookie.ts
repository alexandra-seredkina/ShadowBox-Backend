import type { CookieOptions, Response } from 'express';
import { SESSION_ABSOLUTE_TTL_MS } from '../domain/session.js';

/** `__Host-` makes the browser insist on Secure, Path=/ and no Domain. */
export const SESSION_COOKIE = '__Host-sb_session';

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

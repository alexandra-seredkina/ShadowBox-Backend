import type { CookieOptions, Request, Response } from 'express';
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

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
}

/** Express has no cookie parser installed; only this one cookie is ever read. */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.cookie;
  if (header === undefined) {
    return null;
  }
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (
      separator !== -1 &&
      pair.slice(0, separator).trim() === SESSION_COOKIE
    ) {
      return pair.slice(separator + 1).trim();
    }
  }
  return null;
}

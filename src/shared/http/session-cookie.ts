import type { Request } from 'express';

/** `__Host-` makes the browser insist on Secure, Path=/ and no Domain. */
export const SESSION_COOKIE = '__Host-sb_session';

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

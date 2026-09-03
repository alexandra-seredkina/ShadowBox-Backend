import type { Request } from 'express';
import type { ClientContext } from '../domain/client-context.js';

/** `request.ip` honours the trusted proxy setting; the socket address is the fallback. */
export function clientContextOf(request: Request): ClientContext {
  const ip = request.ip ?? request.socket.remoteAddress;
  if (ip === undefined) {
    throw new Error('Client address is unknown: the socket is already closed');
  }
  return { ip, userAgent: request.headers['user-agent'] };
}

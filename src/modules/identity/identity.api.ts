/**
 * What other modules may use from identity. Routes are protected with
 * `@UseGuards(SessionGuard)` and read the caller with `@CurrentSession()`;
 * IdentityModule exports the providers behind them.
 */
export type { AuthenticatedSession } from './application/authenticate-session.handler.js';
export { CurrentSession, SessionGuard } from './presentation/session.guard.js';

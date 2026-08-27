import type { Login } from './login.js';

/**
 * Salt answered for logins that do not exist. It must be deterministic:
 * a salt that changes between calls would reveal the login is unknown.
 * For the same reason the key behind it is never rotated.
 */
export abstract class DecoySaltSource {
  abstract saltFor(login: Login): Uint8Array;
}

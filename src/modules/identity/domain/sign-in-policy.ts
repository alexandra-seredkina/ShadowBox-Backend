import type {
  AttemptWindow,
  CounterKey,
} from '../../../shared/kernel/attempt-counter.js';
import type { Login } from './login.js';

export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
export const POW_AFTER_LOGIN_FAILURES = 5;
export const POW_AFTER_IP_FAILURES = 20;
export const LOCK_AFTER_LOGIN_FAILURES = 10;

/** Counted for every login string, existing or not, so lockouts reveal nothing. */
export function loginFailuresKey(login: Login): CounterKey {
  return { scope: 'sign-in:login', subject: login };
}

export function ipFailuresKey(ip: string): CounterKey {
  return { scope: 'sign-in:ip', subject: ip };
}

export type SignInGate =
  | { readonly kind: 'open' }
  | { readonly kind: 'pow_required' }
  | { readonly kind: 'locked'; readonly resetsAt: Date | null };

export function decideSignInGate(failures: {
  readonly login: AttemptWindow;
  readonly ip: AttemptWindow;
}): SignInGate {
  if (failures.login.count >= LOCK_AFTER_LOGIN_FAILURES) {
    return { kind: 'locked', resetsAt: failures.login.resetsAt };
  }
  if (
    failures.login.count >= POW_AFTER_LOGIN_FAILURES ||
    failures.ip.count >= POW_AFTER_IP_FAILURES
  ) {
    return { kind: 'pow_required' };
  }
  return { kind: 'open' };
}

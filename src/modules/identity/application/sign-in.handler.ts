import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AttemptCounter,
  secondsUntil,
} from '../../../shared/kernel/attempt-counter.js';
import { Clock } from '../../../shared/kernel/clock.js';
import { SecureRandom } from '../../../shared/kernel/secure-random.js';
import type {
  AccountCredentials,
  AccountKeys,
  AccountSummary,
} from '../domain/account.js';
import { AUTH_KEY_BYTES } from '../domain/account.js';
import { AccountRepository } from '../domain/account.repository.js';
import { AuthKeyHasher } from '../domain/auth-key-hasher.js';
import type { ClientContext } from '../domain/client-context.js';
import {
  AccountLockedError,
  InvalidCredentialsError,
  PowRequiredError,
} from '../domain/identity.errors.js';
import { Login, parseLogin } from '../domain/login.js';
import { SessionRepository } from '../domain/session.repository.js';
import {
  decideSignInGate,
  ipFailuresKey,
  loginFailuresKey,
  SIGN_IN_WINDOW_MS,
} from '../domain/sign-in-policy.js';
import { PowSolution, PowVerifier } from './pow-verifier.js';
import { SessionIssuer } from './session-issuer.js';

export interface SignInCommand {
  readonly login: string;
  readonly authKey: Uint8Array;
  readonly pow: PowSolution | null;
  readonly client: ClientContext;
}

export interface SignInOutcome {
  readonly account: AccountSummary;
  readonly keys: AccountKeys;
  readonly sessionToken: Uint8Array;
}

@Injectable()
export class SignInHandler implements OnModuleInit {
  /** Verified for unknown logins, so both failures cost the same Argon2id. */
  private decoyHash: Promise<string> | undefined;

  constructor(
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: AuthKeyHasher,
    private readonly failures: AttemptCounter,
    private readonly powVerifier: PowVerifier,
    private readonly sessionIssuer: SessionIssuer,
    private readonly random: SecureRandom,
    private readonly clock: Clock,
  ) {}

  /** Computed at start-up so the first unknown login is not slower than the rest. */
  async onModuleInit(): Promise<void> {
    await this.loadDecoyHash();
  }

  async execute(command: SignInCommand): Promise<SignInOutcome> {
    const login = parseLogin(command.login);
    await this.passGate(login, command);
    const credentials = await this.checkCredentials(login, command.authKey);
    if (credentials === null) {
      await this.recordFailure(login, command.client.ip);
      throw new InvalidCredentialsError();
    }
    await this.failures.reset(loginFailuresKey(login));
    await this.upgradeHashIfWeak(credentials, command.authKey);
    const session = this.sessionIssuer.issue({
      client: command.client,
      isIpBound: credentials.isIpBindingEnabled,
    });
    await this.sessions.create(credentials.id, session.draft);
    const [account, keys] = await Promise.all([
      this.accounts.loadSummary(credentials.id),
      this.accounts.loadKeys(credentials.id),
    ]);
    return { account, keys, sessionToken: session.token };
  }

  private async passGate(login: Login, command: SignInCommand): Promise<void> {
    const now = this.clock.now();
    const [loginWindow, ipWindow] = await Promise.all([
      this.failures.peek(loginFailuresKey(login), now),
      this.failures.peek(ipFailuresKey(command.client.ip), now),
    ]);
    const gate = decideSignInGate({ login: loginWindow, ip: ipWindow });
    switch (gate.kind) {
      case 'open':
        return;
      case 'locked':
        throw new AccountLockedError(secondsUntil(gate.resetsAt, now));
      case 'pow_required':
        if (command.pow === null) {
          throw new PowRequiredError();
        }
        await this.powVerifier.verify(command.pow, 'login');
    }
  }

  private async checkCredentials(
    login: Login,
    authKey: Uint8Array,
  ): Promise<AccountCredentials | null> {
    const credentials = await this.accounts.findCredentialsByLogin(login);
    const hash = credentials?.authKeyHash ?? (await this.loadDecoyHash());
    const isValid = await this.hasher.verify(hash, authKey);
    return isValid ? credentials : null;
  }

  private async recordFailure(login: Login, ip: string): Promise<void> {
    const now = this.clock.now();
    await Promise.all([
      this.failures.increment(loginFailuresKey(login), SIGN_IN_WINDOW_MS, now),
      this.failures.increment(ipFailuresKey(ip), SIGN_IN_WINDOW_MS, now),
    ]);
  }

  private async upgradeHashIfWeak(
    credentials: AccountCredentials,
    authKey: Uint8Array,
  ): Promise<void> {
    if (this.hasher.needsRehash(credentials.authKeyHash)) {
      const authKeyHash = await this.hasher.hash(authKey);
      await this.accounts.updateAuthKeyHash(credentials.id, authKeyHash);
    }
  }

  private loadDecoyHash(): Promise<string> {
    this.decoyHash ??= this.hasher.hash(this.random.bytes(AUTH_KEY_BYTES));
    return this.decoyHash;
  }
}

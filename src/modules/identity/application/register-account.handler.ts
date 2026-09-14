import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import { IdempotencyConflictError } from '../../../shared/errors/idempotency-conflict.error.js';
import {
  AliasAddressTakenError,
  generateAliasLocalPart,
} from '../../../shared/kernel/alias-local-part.js';
import { Clock } from '../../../shared/kernel/clock.js';
import {
  IDEMPOTENCY_TTL_MS,
  IdempotencyClaim,
  IdempotencyKeyTakenError,
  IdempotencyRepository,
} from '../../../shared/kernel/idempotency.js';
import { SecureRandom } from '../../../shared/kernel/secure-random.js';
import type { AccountId, EncryptedPrivateKey } from '../domain/account.js';
import { AccountRepository } from '../domain/account.repository.js';
import { AccountRegistrar } from '../domain/account-registrar.js';
import { AuthKeyHasher } from '../domain/auth-key-hasher.js';
import type { ClientContext } from '../domain/client-context.js';
import { LoginReservedError } from '../domain/identity.errors.js';
import { standardKdfParams } from '../domain/kdf-params.js';
import { Login, parseLogin } from '../domain/login.js';
import {
  fromRegistrationSnapshot,
  REGISTER_OPERATION,
  RegistrationResult,
} from '../domain/registration.js';
import { isReservedLogin } from '../domain/reserved-logins.js';
import { SessionRepository } from '../domain/session.repository.js';
import { PowSolution, PowVerifier } from './pow-verifier.js';
import { SessionIssuer } from './session-issuer.js';

/** A collision of two random 10-character addresses is already unlikely. */
const MAX_ALIAS_ATTEMPTS = 3;

export interface RegisterAccountCommand {
  readonly login: string;
  readonly authKey: Uint8Array;
  readonly kdfSalt: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly encryptedPrivateKey: EncryptedPrivateKey;
  readonly recoveryEncryptedPrivateKey: EncryptedPrivateKey;
  readonly pow: PowSolution;
  readonly idempotencyKey: string | null;
  readonly client: ClientContext;
}

export interface RegisterAccountOutcome {
  readonly result: RegistrationResult;
  readonly sessionToken: Uint8Array;
}

/**
 * authKey is left out: the hash lives for a day next to the account, and a
 * replay proves the key against the stored Argon2id hash instead.
 */
function hashRequest(
  login: Login,
  command: RegisterAccountCommand,
): Uint8Array {
  const encode = (bytes: Uint8Array): string =>
    Buffer.from(bytes).toString('base64url');
  const fields = [
    login,
    encode(command.kdfSalt),
    encode(command.publicKey),
    encode(command.encryptedPrivateKey.nonce),
    encode(command.encryptedPrivateKey.ciphertext),
    encode(command.recoveryEncryptedPrivateKey.nonce),
    encode(command.recoveryEncryptedPrivateKey.ciphertext),
    command.pow.challengeId,
    command.pow.nonce,
  ];
  return createHash('sha256').update(JSON.stringify(fields)).digest();
}

@Injectable()
export class RegisterAccountHandler {
  constructor(
    private readonly registrar: AccountRegistrar,
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly powVerifier: PowVerifier,
    private readonly idempotency: IdempotencyRepository,
    private readonly hasher: AuthKeyHasher,
    private readonly sessionIssuer: SessionIssuer,
    private readonly random: SecureRandom,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async execute(
    command: RegisterAccountCommand,
  ): Promise<RegisterAccountOutcome> {
    const login = parseLogin(command.login);
    if (isReservedLogin(login)) {
      throw new LoginReservedError();
    }
    const requestHash = hashRequest(login, command);
    const replayed = await this.replay(command, requestHash);
    if (replayed !== null) {
      return replayed;
    }
    await this.powVerifier.verify(command.pow, 'register');
    try {
      return await this.registerNew(login, command, requestHash);
    } catch (error) {
      if (!(error instanceof IdempotencyKeyTakenError)) {
        throw error;
      }
      return (await this.replay(command, requestHash)) ?? Promise.reject(error);
    }
  }

  private async registerNew(
    login: Login,
    command: RegisterAccountCommand,
    requestHash: Uint8Array,
  ): Promise<RegisterAccountOutcome> {
    const account = {
      login,
      authKeyHash: await this.hasher.hash(command.authKey),
      kdf: standardKdfParams(command.kdfSalt),
      publicKey: command.publicKey,
      encryptedPrivateKey: command.encryptedPrivateKey,
      recoveryEncryptedPrivateKey: command.recoveryEncryptedPrivateKey,
    };
    const session = this.sessionIssuer.issue({
      client: command.client,
      isIpBound: true,
    });
    const claim = this.claimFor(command.idempotencyKey, requestHash);
    for (let attempt = 1; ; attempt += 1) {
      const firstAlias = {
        localPart: generateAliasLocalPart(this.random),
        domain: this.config.mailDomain,
      };
      try {
        const result = await this.registrar.register(
          { account, firstAlias, session: session.draft },
          claim,
        );
        return { result, sessionToken: session.token };
      } catch (error) {
        if (
          !(error instanceof AliasAddressTakenError) ||
          attempt >= MAX_ALIAS_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
  }

  private claimFor(
    key: string | null,
    requestHash: Uint8Array,
  ): IdempotencyClaim | null {
    if (key === null) {
      return null;
    }
    const expiresAt = new Date(this.clock.now().getTime() + IDEMPOTENCY_TTL_MS);
    return { key, operation: REGISTER_OPERATION, requestHash, expiresAt };
  }

  /** A retry with the same key and body gets the original answer and a fresh session. */
  private async replay(
    command: RegisterAccountCommand,
    requestHash: Uint8Array,
  ): Promise<RegisterAccountOutcome | null> {
    if (command.idempotencyKey === null) {
      return null;
    }
    const stored = await this.idempotency.findByKey(
      command.idempotencyKey,
      this.clock.now(),
    );
    if (stored === null) {
      return null;
    }
    const isSameRequest =
      stored.operation === REGISTER_OPERATION &&
      Buffer.from(stored.requestHash).equals(requestHash);
    const credentials =
      isSameRequest && stored.accountId !== null
        ? await this.accounts.findCredentialsById(stored.accountId as AccountId)
        : null;
    if (
      credentials === null ||
      !(await this.hasher.verify(credentials.authKeyHash, command.authKey))
    ) {
      throw new IdempotencyConflictError();
    }
    const session = this.sessionIssuer.issue({
      client: command.client,
      isIpBound: credentials.isIpBindingEnabled,
    });
    await this.sessions.create(credentials.id, session.draft);
    return {
      result: fromRegistrationSnapshot(stored.snapshot),
      sessionToken: session.token,
    };
  }
}

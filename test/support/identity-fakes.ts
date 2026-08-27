import { createHash, randomUUID } from 'node:crypto';
import { AccountKdfRepository } from '../../src/modules/identity/domain/account-kdf.repository.js';
import { DecoySaltSource } from '../../src/modules/identity/domain/decoy-salt.source.js';
import type { KdfParams } from '../../src/modules/identity/domain/kdf-params.js';
import type { Login } from '../../src/modules/identity/domain/login.js';
import type {
  NewPowChallenge,
  PowChallenge,
  PowChallengeId,
} from '../../src/modules/identity/domain/pow-challenge.js';
import { PowChallengeRepository } from '../../src/modules/identity/domain/pow-challenge.repository.js';

export class InMemoryPowChallengeRepository implements PowChallengeRepository {
  readonly saved = new Map<PowChallengeId, PowChallenge>();

  create(challenge: NewPowChallenge): Promise<PowChallenge> {
    const stored = { ...challenge, id: randomUUID() as PowChallengeId };
    this.saved.set(stored.id, stored);
    return Promise.resolve(stored);
  }

  consume(id: PowChallengeId): Promise<PowChallenge | null> {
    const found = this.saved.get(id) ?? null;
    this.saved.delete(id);
    return Promise.resolve(found);
  }
}

export class InMemoryAccountKdfRepository implements AccountKdfRepository {
  private readonly accounts = new Map<string, KdfParams>();

  add(login: string, params: KdfParams): void {
    this.accounts.set(login, params);
  }

  findByLogin(login: Login): Promise<KdfParams | null> {
    return Promise.resolve(this.accounts.get(login) ?? null);
  }
}

export class HashDecoySaltSource implements DecoySaltSource {
  saltFor(login: Login): Uint8Array {
    return createHash('sha256').update(login).digest().subarray(0, 16);
  }
}

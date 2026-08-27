import { Injectable } from '@nestjs/common';
import { AccountKdfRepository } from '../domain/account-kdf.repository.js';
import { DecoySaltSource } from '../domain/decoy-salt.source.js';
import { KdfParams, standardKdfParams } from '../domain/kdf-params.js';
import { parseLogin } from '../domain/login.js';

export interface LoadKdfParamsQuery {
  readonly login: string;
}

/** Answers for unknown logins too, so prelogin cannot be used to find accounts. */
@Injectable()
export class LoadKdfParamsHandler {
  constructor(
    private readonly accounts: AccountKdfRepository,
    private readonly decoySalts: DecoySaltSource,
  ) {}

  async execute(query: LoadKdfParamsQuery): Promise<KdfParams> {
    const login = parseLogin(query.login);
    const existing = await this.accounts.findByLogin(login);
    return existing ?? standardKdfParams(this.decoySalts.saltFor(login));
  }
}

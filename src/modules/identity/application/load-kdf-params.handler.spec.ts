import {
  HashDecoySaltSource,
  InMemoryAccountKdfRepository,
} from '../../../../test/support/identity-fakes.js';
import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import { standardKdfParams } from '../domain/kdf-params.js';
import { LoadKdfParamsHandler } from './load-kdf-params.handler.js';

describe('LoadKdfParamsHandler', () => {
  const realParams = standardKdfParams(new Uint8Array(16).fill(9));
  let accounts: InMemoryAccountKdfRepository;
  let handler: LoadKdfParamsHandler;

  beforeEach(() => {
    accounts = new InMemoryAccountKdfRepository();
    accounts.add('kage', realParams);
    handler = new LoadKdfParamsHandler(accounts, new HashDecoySaltSource());
  });

  it('returns the stored parameters of an existing account', async () => {
    await expect(handler.execute({ login: 'kage' })).resolves.toEqual(
      realParams,
    );
  });

  it('normalizes the login before looking it up', async () => {
    await expect(handler.execute({ login: 'ＫＡＧＥ' })).resolves.toEqual(
      realParams,
    );
  });

  it('answers an unknown login with decoy parameters of the same shape', async () => {
    const decoy = await handler.execute({ login: 'nobody' });

    expect(decoy).toEqual({ ...realParams, salt: expect.any(Uint8Array) });
    expect(decoy.salt).toHaveLength(16);
  });

  it('gives the same decoy salt on every call', async () => {
    const first = await handler.execute({ login: 'nobody' });
    const second = await handler.execute({ login: 'NoBody' });

    expect(second.salt).toEqual(first.salt);
  });

  it('rejects a malformed login', async () => {
    await expect(handler.execute({ login: '.x' })).rejects.toBeInstanceOf(
      ValidationFailedError,
    );
  });
});

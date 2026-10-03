import { InMemoryAliasRepository } from '../../../../test/support/alias-fakes.js';
import type { OwnerId } from '../domain/alias.js';
import { ExpireTemporaryAliasesJob } from './expire-temporary-aliases.job.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const OWNER = '0192c5a0-7d2e-7b3a-8c4d-000000000001' as OwnerId;

describe('ExpireTemporaryAliasesJob', () => {
  it('revokes what has expired and is idempotent', async () => {
    const aliases = new InMemoryAliasRepository();
    const options = { maxActive: 20, now: NOW, idempotency: null };
    const base = {
      ownerId: OWNER,
      domain: 'shadowbox.test',
      kind: 'temporary' as const,
      encryptedLabel: null,
      folderId: null,
      labelIds: [],
    };
    await aliases.create(
      { ...base, localPart: 'expired000', expiresAt: NOW },
      options,
    );
    await aliases.create(
      {
        ...base,
        localPart: 'living0000',
        expiresAt: new Date(NOW.getTime() + 1),
      },
      options,
    );
    const job = new ExpireTemporaryAliasesJob(aliases);

    await expect(job.run(NOW)).resolves.toBe(1);
    await expect(job.run(NOW)).resolves.toBe(0);
    expect(aliases.rows.map((row) => row.status)).toEqual([
      'revoked',
      'active',
    ]);
  });
});

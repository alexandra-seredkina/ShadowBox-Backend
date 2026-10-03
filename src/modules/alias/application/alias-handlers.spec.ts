import {
  InMemoryAliasRepository,
  InMemoryFolderDirectory,
  InMemoryLabelDirectory,
} from '../../../../test/support/alias-fakes.js';
import {
  FixedClock,
  InMemoryAttemptCounter,
  SequentialRandom,
} from '../../../../test/support/kernel-fakes.js';
import { createTestConfig } from '../../../../test/support/test-config.js';
import { IdempotencyConflictError } from '../../../shared/errors/idempotency-conflict.error.js';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { RateLimitedError } from '../../../shared/errors/rate-limited.error.js';
import { ReauthRequiredError } from '../../../shared/errors/reauth-required.error.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { AliasId, OwnerId } from '../domain/alias.js';
import { MAX_ACTIVE_ALIASES } from '../domain/alias.js';
import { AliasLimitExceededError } from '../domain/alias.errors.js';
import {
  CreateAliasCommand,
  CreateAliasHandler,
} from './create-alias.handler.js';
import { ListAliasesHandler } from './list-aliases.handler.js';
import { RevokeAliasHandler } from './revoke-alias.handler.js';
import { UpdateAliasHandler } from './update-alias.handler.js';

const NOW = new Date('2020-01-15T12:00:00Z');
const KAGE = '0192c5a0-7d2e-7b3a-8c4d-000000000001' as OwnerId;
const OTHER = '0192c5a0-7d2e-7b3a-8c4d-000000000002' as OwnerId;
const KAGE_FOLDER = '0192c5a0-7d2e-7b3a-8c4d-0000000000f1';
const OTHER_FOLDER = '0192c5a0-7d2e-7b3a-8c4d-0000000000f2';
const KEY = '0192c5a0-7d2e-7b3a-8c4d-5e6f7a8b9c0d';
const LABEL: EncryptedBlobJson = {
  v: 1,
  alg: 'x25519-xchacha20poly1305',
  sealedKey: 'sealed',
  nonce: 'nonce',
  ciphertext: 'label',
};

const KAGE_LABEL = '0192c5a0-7d2e-7b3a-8c4d-0000000000a1';
const OTHER_LABEL = '0192c5a0-7d2e-7b3a-8c4d-0000000000a2';

describe('alias handlers', () => {
  let clock: FixedClock;
  let aliases: InMemoryAliasRepository;
  let create: CreateAliasHandler;
  let update: UpdateAliasHandler;
  let revoke: RevokeAliasHandler;
  let list: ListAliasesHandler;

  function command(
    overrides: Partial<CreateAliasCommand> = {},
  ): CreateAliasCommand {
    return {
      ownerId: KAGE,
      lifetime: { kind: 'temporary', ttl: '7d' },
      encryptedLabel: LABEL,
      folderId: null,
      labelIds: [],
      idempotencyKey: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    clock = new FixedClock(NOW);
    aliases = new InMemoryAliasRepository();
    const folders = new InMemoryFolderDirectory();
    folders.folders.set(KAGE_FOLDER, KAGE);
    folders.folders.set(OTHER_FOLDER, OTHER);
    const labels = new InMemoryLabelDirectory();
    labels.labels.set(KAGE_LABEL, KAGE);
    labels.labels.set(OTHER_LABEL, OTHER);
    create = new CreateAliasHandler(
      aliases,
      folders,
      labels,
      aliases,
      new InMemoryAttemptCounter(),
      new SequentialRandom(),
      clock,
      createTestConfig(),
    );
    update = new UpdateAliasHandler(aliases, folders, labels, clock);
    revoke = new RevokeAliasHandler(aliases, clock);
    list = new ListAliasesHandler(aliases, clock);
  });

  describe('CreateAliasHandler', () => {
    it('creates a temporary address that expires after its TTL', async () => {
      const alias = await create.execute(command());

      expect(alias).toMatchObject({
        kind: 'temporary',
        status: 'active',
        domain: 'shadowbox.test',
        encryptedLabel: LABEL,
        expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
      });
      expect(alias.localPart).toMatch(/^[a-z0-9]{10}$/);
    });

    it('creates a permanent address without expiry in an own folder', async () => {
      const alias = await create.execute(
        command({ lifetime: { kind: 'permanent' }, folderId: KAGE_FOLDER }),
      );

      expect(alias).toMatchObject({
        kind: 'permanent',
        expiresAt: null,
        folderId: KAGE_FOLDER,
      });
    });

    it('refuses a folder of another account', async () => {
      await expect(
        create.execute(command({ folderId: OTHER_FOLDER })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('draws a new address when the generated one is taken', async () => {
      // SequentialRandom: the first draw fills the local part with "b".
      aliases.takenAddresses.add('bbbbbbbbbb@shadowbox.test');

      const alias = await create.execute(command());

      expect(alias.localPart).toBe('cccccccccc');
    });

    it('stops at the limit of active addresses', async () => {
      for (let index = 0; index < MAX_ACTIVE_ALIASES; index += 1) {
        await create.execute(command());
      }

      await expect(create.execute(command())).rejects.toBeInstanceOf(
        AliasLimitExceededError,
      );
    });

    it('limits creations to thirty an hour', async () => {
      for (let index = 0; index < 30; index += 1) {
        const alias = await create.execute(command());
        await revoke.execute({
          ownerId: KAGE,
          id: alias.id,
          reauthUntil: null,
        });
      }

      await expect(create.execute(command())).rejects.toBeInstanceOf(
        RateLimitedError,
      );
    });

    it('replays a retry with the same key and body', async () => {
      const first = await create.execute(command({ idempotencyKey: KEY }));

      const second = await create.execute(command({ idempotencyKey: KEY }));

      expect(second).toEqual(first);
      expect(aliases.rows).toHaveLength(1);
    });

    it('refuses the same key with another body or from another account', async () => {
      await create.execute(command({ idempotencyKey: KEY }));

      await expect(
        create.execute(command({ idempotencyKey: KEY, encryptedLabel: null })),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);
      await expect(
        create.execute(command({ idempotencyKey: KEY, ownerId: OTHER })),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);
    });
  });

  describe('ListAliasesHandler', () => {
    it('lists own live addresses, newest first, filtered by status', async () => {
      const older = await create.execute(command());
      clock.advanceBy(1000);
      const newer = await create.execute(
        command({ lifetime: { kind: 'permanent' } }),
      );
      await create.execute(command({ ownerId: OTHER }));
      await update.execute({
        ownerId: KAGE,
        id: older.id,
        changes: { status: 'disabled' },
      });

      const all = await list.execute({ ownerId: KAGE, status: null });
      const disabled = await list.execute({
        ownerId: KAGE,
        status: 'disabled',
      });

      expect(all.map((alias) => alias.id)).toEqual([newer.id, older.id]);
      expect(disabled.map((alias) => alias.id)).toEqual([older.id]);
    });

    it('hides a temporary address once it has expired', async () => {
      await create.execute(
        command({ lifetime: { kind: 'temporary', ttl: '1h' } }),
      );
      clock.advanceBy(60 * 60 * 1000);

      await expect(
        list.execute({ ownerId: KAGE, status: null }),
      ).resolves.toEqual([]);
    });
  });

  describe('UpdateAliasHandler', () => {
    it('changes only the fields it is given', async () => {
      const alias = await create.execute(command());

      const updated = await update.execute({
        ownerId: KAGE,
        id: alias.id,
        changes: { folderId: KAGE_FOLDER },
      });

      expect(updated).toMatchObject({
        folderId: KAGE_FOLDER,
        encryptedLabel: LABEL,
        status: 'active',
      });
    });

    it('clears the label with null', async () => {
      const alias = await create.execute(command());

      const updated = await update.execute({
        ownerId: KAGE,
        id: alias.id,
        changes: { encryptedLabel: null },
      });

      expect(updated.encryptedLabel).toBeNull();
    });

    it('answers NOT_FOUND for another account and for another folder owner', async () => {
      const alias = await create.execute(command());

      await expect(
        update.execute({
          ownerId: OTHER,
          id: alias.id,
          changes: { status: 'disabled' },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        update.execute({
          ownerId: KAGE,
          id: alias.id,
          changes: { folderId: OTHER_FOLDER },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('refuses to enable an address beyond the limit', async () => {
      const disabled = await create.execute(command());
      await update.execute({
        ownerId: KAGE,
        id: disabled.id,
        changes: { status: 'disabled' },
      });
      for (let index = 0; index < MAX_ACTIVE_ALIASES; index += 1) {
        await create.execute(command());
      }

      await expect(
        update.execute({
          ownerId: KAGE,
          id: disabled.id,
          changes: { status: 'active' },
        }),
      ).rejects.toBeInstanceOf(AliasLimitExceededError);
    });
  });

  describe('RevokeAliasHandler', () => {
    it('revokes a temporary address without reauth', async () => {
      const alias = await create.execute(command());

      await revoke.execute({ ownerId: KAGE, id: alias.id, reauthUntil: null });

      await expect(
        list.execute({ ownerId: KAGE, status: null }),
      ).resolves.toEqual([]);
    });

    it('wants reauth for a permanent address', async () => {
      const alias = await create.execute(
        command({ lifetime: { kind: 'permanent' } }),
      );

      await expect(
        revoke.execute({ ownerId: KAGE, id: alias.id, reauthUntil: null }),
      ).rejects.toBeInstanceOf(ReauthRequiredError);
      await expect(
        revoke.execute({ ownerId: KAGE, id: alias.id, reauthUntil: NOW }),
      ).rejects.toBeInstanceOf(ReauthRequiredError);
    });

    it('revokes a permanent address inside the reauth window', async () => {
      const alias = await create.execute(
        command({ lifetime: { kind: 'permanent' } }),
      );

      await revoke.execute({
        ownerId: KAGE,
        id: alias.id,
        reauthUntil: new Date(NOW.getTime() + 60_000),
      });

      expect(aliases.rows[0]).toMatchObject({
        status: 'revoked',
        encryptedLabel: null,
      });
    });

    it('answers NOT_FOUND before asking for reauth', async () => {
      const alias = await create.execute(
        command({ lifetime: { kind: 'permanent' } }),
      );

      await expect(
        revoke.execute({ ownerId: OTHER, id: alias.id, reauthUntil: null }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        revoke.execute({
          ownerId: KAGE,
          id: '0192c5a0-0000-7000-8000-000000000000' as AliasId,
          reauthUntil: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('labels', () => {
    it('creates an address that labels its mail', async () => {
      const alias = await create.execute(command({ labelIds: [KAGE_LABEL] }));

      expect(alias.labelIds).toEqual([KAGE_LABEL]);
    });

    it("refuses someone else's label and creates nothing", async () => {
      await expect(
        create.execute(command({ labelIds: [KAGE_LABEL, OTHER_LABEL] })),
      ).rejects.toThrow(NotFoundError);
      expect(aliases.rows).toHaveLength(0);
    });

    it('replaces the labels of an address', async () => {
      const alias = await create.execute(command({ labelIds: [KAGE_LABEL] }));

      const cleared = await update.execute({
        ownerId: KAGE,
        id: alias.id,
        changes: { labelIds: [] },
      });

      expect(cleared.labelIds).toEqual([]);
      await expect(
        update.execute({
          ownerId: KAGE,
          id: alias.id,
          changes: { labelIds: [OTHER_LABEL] },
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });
});

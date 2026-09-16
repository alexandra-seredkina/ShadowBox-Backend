import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { Folder, FolderId, FolderOwnerId } from '../domain/folder.js';
import { MAX_CUSTOM_FOLDERS } from '../domain/folder.js';
import { FolderRepository } from '../domain/folder.repository.js';
import { CreateFolderHandler } from './create-folder.handler.js';
import { DeleteFolderHandler } from './delete-folder.handler.js';
import { RenameFolderHandler } from './rename-folder.handler.js';

const OWNER = '0192c5a0-7d2e-7b3a-8c4d-000000000001' as FolderOwnerId;
const ID = '0192c5a0-7d2e-7b3a-8c4d-0000000000f1' as FolderId;
const NAME: EncryptedBlobJson = {
  v: 1,
  alg: 'x25519-xchacha20poly1305',
  sealedKey: 's',
  nonce: 'n',
  ciphertext: 'c',
};
const FOLDER: Folder = {
  id: ID,
  kind: 'custom',
  encryptedName: NAME,
  unreadCount: 0,
};

/** Records calls and answers as if the folder belonged to someone else. */
class ForeignFolders implements FolderRepository {
  maxCustom: number | null = null;

  list(): Promise<Folder[]> {
    return Promise.resolve([]);
  }

  create(
    _owner: FolderOwnerId,
    _name: EncryptedBlobJson,
    maxCustom: number,
  ): Promise<Folder> {
    this.maxCustom = maxCustom;
    return Promise.resolve(FOLDER);
  }

  rename(): Promise<Folder | null> {
    return Promise.resolve(null);
  }

  delete(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

describe('folder handlers', () => {
  it('creates with the fifty custom folder limit', async () => {
    const folders = new ForeignFolders();

    await new CreateFolderHandler(folders).execute({
      ownerId: OWNER,
      encryptedName: NAME,
    });

    expect(folders.maxCustom).toBe(MAX_CUSTOM_FOLDERS);
  });

  it('turns a foreign folder into NOT_FOUND on rename and delete', async () => {
    const folders = new ForeignFolders();

    await expect(
      new RenameFolderHandler(folders).execute({
        ownerId: OWNER,
        id: ID,
        encryptedName: NAME,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      new DeleteFolderHandler(folders).execute({ ownerId: OWNER, id: ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

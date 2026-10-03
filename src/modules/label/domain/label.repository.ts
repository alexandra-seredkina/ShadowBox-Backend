import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { Label, LabelId, LabelOwnerId } from './label.js';

/** Every call is scoped to the owner; someone else's label is reported as missing. */
export abstract class LabelRepository {
  /** By creation. */
  abstract list(ownerId: LabelOwnerId): Promise<Label[]>;

  /** @throws LabelLimitExceededError */
  abstract create(
    ownerId: LabelOwnerId,
    encryptedName: EncryptedBlobJson,
    maxLabels: number,
  ): Promise<Label>;

  abstract rename(
    ownerId: LabelOwnerId,
    id: LabelId,
    encryptedName: EncryptedBlobJson,
  ): Promise<Label | null>;

  /** Takes the label off messages and addresses; the messages stay. */
  abstract delete(ownerId: LabelOwnerId, id: LabelId): Promise<boolean>;
}

import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import type { Label, LabelId, LabelOwnerId } from '../domain/label.js';
import { LabelRepository } from '../domain/label.repository.js';

@Injectable()
export class RenameLabelHandler {
  constructor(private readonly labels: LabelRepository) {}

  async execute(command: {
    readonly ownerId: LabelOwnerId;
    readonly id: LabelId;
    readonly encryptedName: EncryptedBlobJson;
  }): Promise<Label> {
    const renamed = await this.labels.rename(
      command.ownerId,
      command.id,
      command.encryptedName,
    );
    if (renamed === null) {
      throw new NotFoundError();
    }
    return renamed;
  }
}

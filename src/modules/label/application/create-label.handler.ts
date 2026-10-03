import { Injectable } from '@nestjs/common';
import type { EncryptedBlobJson } from '../../../shared/kernel/encrypted-blob.js';
import { Label, LabelOwnerId, MAX_LABELS } from '../domain/label.js';
import { LabelRepository } from '../domain/label.repository.js';

@Injectable()
export class CreateLabelHandler {
  constructor(private readonly labels: LabelRepository) {}

  execute(command: {
    readonly ownerId: LabelOwnerId;
    readonly encryptedName: EncryptedBlobJson;
  }): Promise<Label> {
    return this.labels.create(
      command.ownerId,
      command.encryptedName,
      MAX_LABELS,
    );
  }
}

import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type { LabelId, LabelOwnerId } from '../domain/label.js';
import { LabelRepository } from '../domain/label.repository.js';

@Injectable()
export class DeleteLabelHandler {
  constructor(private readonly labels: LabelRepository) {}

  async execute(command: {
    readonly ownerId: LabelOwnerId;
    readonly id: LabelId;
  }): Promise<void> {
    if (!(await this.labels.delete(command.ownerId, command.id))) {
      throw new NotFoundError();
    }
  }
}

import { Injectable } from '@nestjs/common';
import type { Label, LabelOwnerId } from '../domain/label.js';
import { LabelRepository } from '../domain/label.repository.js';

@Injectable()
export class ListLabelsHandler {
  constructor(private readonly labels: LabelRepository) {}

  execute(ownerId: LabelOwnerId): Promise<Label[]> {
    return this.labels.list(ownerId);
  }
}

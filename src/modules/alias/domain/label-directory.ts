import type { OwnerId } from './alias.js';

/** Answers whether labels belong to the owner, without exposing anything else. */
export abstract class LabelDirectory {
  /** True for an empty list. */
  abstract areOwnLabels(
    ownerId: OwnerId,
    labelIds: readonly string[],
  ): Promise<boolean>;
}

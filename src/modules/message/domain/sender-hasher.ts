import type { MessageOwnerId } from './message.js';

/** Keyed hash of a sender for one account; the address itself is never stored. */
export interface SenderHash {
  readonly hash: Uint8Array;
  readonly keyVersion: number;
}

export abstract class SenderHasher {
  abstract hash(ownerId: MessageOwnerId, address: string): SenderHash;
}

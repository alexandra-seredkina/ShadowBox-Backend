import type { Recipient, RecipientAddress } from './recipient.js';

/**
 * Finds who receives mail on an address. Disabled, revoked, expired and
 * unknown addresses all come back as null, through the same single lookup.
 */
export abstract class RecipientDirectory {
  abstract findDeliverable(
    address: RecipientAddress,
    now: Date,
  ): Promise<Recipient | null>;
}

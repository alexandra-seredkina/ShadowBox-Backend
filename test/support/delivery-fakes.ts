import type {
  Recipient,
  RecipientAccountId,
  RecipientAddress,
  RecipientAliasId,
} from '../../src/modules/delivery/domain/recipient.js';
import { RecipientDirectory } from '../../src/modules/delivery/domain/recipient-directory.js';

/** Knows only the addresses it was given; every other one is undeliverable. */
export class InMemoryRecipientDirectory extends RecipientDirectory {
  private readonly recipients = new Map<string, Recipient>();
  lookups = 0;

  add(localPart: string, recipient: Partial<Recipient> = {}): Recipient {
    const added: Recipient = {
      aliasId: `alias-${localPart}` as RecipientAliasId,
      accountId: 'account-1' as RecipientAccountId,
      ...recipient,
    };
    this.recipients.set(localPart, added);
    return added;
  }

  findDeliverable(address: RecipientAddress): Promise<Recipient | null> {
    this.lookups += 1;
    return Promise.resolve(this.recipients.get(address.localPart) ?? null);
  }
}

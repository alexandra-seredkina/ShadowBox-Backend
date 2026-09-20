import { ALIAS_LOCAL_PART_LENGTH } from '../../../shared/kernel/alias-local-part.js';
import type { Brand } from '../../../shared/kernel/brand.js';

export type RecipientAliasId = Brand<string, 'RecipientAliasId'>;
export type RecipientAccountId = Brand<string, 'RecipientAccountId'>;

export interface RecipientAddress {
  readonly localPart: string;
  readonly domain: string;
}

/** A live address and the account that reads mail sent to it. */
export interface Recipient {
  readonly aliasId: RecipientAliasId;
  readonly accountId: RecipientAccountId;
}

/** One message never fans out to more addresses than this. */
export const MAX_RECIPIENTS_PER_MESSAGE = 50;

const ISSUED_LOCAL_PART = new RegExp(`^[a-z0-9]{${ALIAS_LOCAL_PART_LENGTH}}$`);

/**
 * Only an address the server could have issued is worth a lookup; anything
 * else is refused the same way as an unknown one.
 */
export function parseRecipientAddress(
  raw: string,
  mailDomain: string,
): RecipientAddress | null {
  const address = raw.trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at < 0) {
    return null;
  }
  const localPart = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (domain !== mailDomain || !ISSUED_LOCAL_PART.test(localPart)) {
    return null;
  }
  return { localPart, domain };
}

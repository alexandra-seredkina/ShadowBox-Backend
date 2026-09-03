import type { Prisma } from '../../../generated/prisma/client.js';
import type { AccountId } from '../domain/account.js';
import type { SessionDraft } from '../domain/session.js';

export function toSessionData(
  accountId: AccountId,
  draft: SessionDraft,
): Prisma.SessionUncheckedCreateInput {
  return {
    accountId,
    tokenHash: Uint8Array.from(draft.tokenHash),
    ipHash: Uint8Array.from(draft.ip.hash),
    ipHashKeyVersion: draft.ip.keyVersion,
    isIpBound: draft.isIpBound,
    device: draft.device,
    expiresAt: draft.expiresAt,
  };
}

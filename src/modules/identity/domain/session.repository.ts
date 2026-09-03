import type { AccountId } from './account.js';
import type { SessionDraft, SessionId } from './session.js';

export abstract class SessionRepository {
  abstract create(
    accountId: AccountId,
    draft: SessionDraft,
  ): Promise<SessionId>;
}

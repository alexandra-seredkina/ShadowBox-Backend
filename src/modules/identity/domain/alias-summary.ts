export type AliasKind = 'permanent' | 'temporary';
export type AliasStatus = 'active' | 'disabled';

/** An address as the owner sees it; revoked addresses are never returned. */
export interface AliasSummary {
  readonly id: string;
  readonly localPart: string;
  readonly domain: string;
  readonly kind: AliasKind;
  readonly status: AliasStatus;
  readonly folderId: string | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly lastReceivedAt: Date | null;
}

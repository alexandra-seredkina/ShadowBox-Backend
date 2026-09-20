import type { Brand } from '../../../shared/kernel/brand.js';

export type MessageId = Brand<string, 'MessageId'>;
/** Accounts are owned by identity; here only their id is needed. */
export type MessageOwnerId = Brand<string, 'MessageOwnerId'>;
export type MessageAliasId = Brand<string, 'MessageAliasId'>;
export type MessageFolderId = Brand<string, 'MessageFolderId'>;

const KIB = 1024;

/** Sizes are shown rounded up to 1 KiB, so the exact length of a message never leaves the server. */
export function roundUpToKiB(bytes: number): number {
  return Math.ceil(bytes / KIB) * KIB;
}

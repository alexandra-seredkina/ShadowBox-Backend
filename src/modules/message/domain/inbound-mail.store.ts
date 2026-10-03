import type { EncryptedBlob } from '../../../shared/kernel/encrypted-blob.js';
import type { MessageAliasId, MessageOwnerId } from './message.js';
import type { SenderHash } from './sender-hasher.js';
import type { Threat } from './threat.js';

export interface Mailbox {
  readonly publicKey: Uint8Array;
}

export interface SenderStatus {
  /** The account has had mail from this sender before. */
  readonly isKnown: boolean;
  readonly isBlocked: boolean;
}

export interface NewMessage {
  readonly ownerId: MessageOwnerId;
  readonly aliasId: MessageAliasId;
  readonly receivedAt: Date;
  readonly sizeBytes: number;
  readonly threat: Threat;
  readonly encryptedPreview: EncryptedBlob;
  readonly body: EncryptedBlob;
  /** Null when the message has no sender address to remember. */
  readonly sender: SenderHash | null;
  /** Blocked mail goes to Spam instead of the address's folder. */
  readonly isFromBlockedSender: boolean;
}

export abstract class InboundMailStore {
  /** Null when the address is no longer active, e.g. disabled after RCPT TO. */
  abstract findMailbox(
    ownerId: MessageOwnerId,
    aliasId: MessageAliasId,
  ): Promise<Mailbox | null>;

  abstract findSender(
    ownerId: MessageOwnerId,
    sender: SenderHash,
  ): Promise<SenderStatus>;

  /**
   * One transaction: files the message in Spam when the sender is blocked,
   * otherwise in the address's folder (the inbox when it has none), puts the address's labels on it, remembers the sender
   * and marks when the address last received mail.
   */
  abstract save(message: NewMessage): Promise<void>;
}

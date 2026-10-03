import type { EncryptedBlob } from '../../src/shared/kernel/encrypted-blob.js';
import type {
  BatchAction,
  MessageChanges,
  MessageFolderId,
  MessageId,
  MessageLabelId,
  MessageOwnerId,
  MessagePosition,
  MessageScope,
  MessageSummary,
} from '../../src/modules/message/domain/message.js';
import { MessageRepository } from '../../src/modules/message/domain/message.repository.js';

interface StoredMessage {
  readonly ownerId: string;
  readonly summary: MessageSummary;
  readonly body: EncryptedBlob;
}

function newestFirst(a: MessagePosition, b: MessagePosition): number {
  const byTime = b.receivedAt.getTime() - a.receivedAt.getTime();
  return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
}

export function messageSummary(
  overrides: Partial<MessageSummary> = {},
): MessageSummary {
  return {
    id: '00000000-0000-7000-8000-000000000001' as MessageId,
    folderId: 'folder-inbox' as MessageFolderId,
    aliasId: null,
    receivedAt: new Date('2020-01-15T12:00:00Z'),
    isRead: false,
    isStarred: false,
    sizeBytes: 1024,
    labelIds: [],
    threat: {
      verdict: 'safe',
      markers: [],
      auth: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
    },
    encryptedPreview: {
      v: 1,
      alg: 'x25519-xchacha20poly1305',
      sealedKey: 'k',
      nonce: 'n',
      ciphertext: 'c',
    },
    ...overrides,
  };
}

function flagChange(
  kind: 'markRead' | 'markUnread' | 'star' | 'unstar',
): MessageChanges {
  switch (kind) {
    case 'markRead':
    case 'markUnread':
      return { isRead: kind === 'markRead' };
    case 'star':
    case 'unstar':
      return { isStarred: kind === 'star' };
  }
}

/** Follows the repository contract: everything is scoped to the owner. */
export class InMemoryMessageRepository extends MessageRepository {
  private messages: StoredMessage[] = [];
  private readonly folders = new Map<string, string>();
  private readonly trashes = new Set<string>();
  private readonly labels = new Map<string, string>();

  addLabel(ownerId: string, labelId: string): void {
    this.labels.set(labelId, ownerId);
  }

  isOwnLabel(
    ownerId: MessageOwnerId,
    labelId: MessageLabelId,
  ): Promise<boolean> {
    return Promise.resolve(this.labels.get(labelId) === ownerId);
  }

  addFolder(ownerId: string, folderId: string): void {
    this.folders.set(folderId, ownerId);
  }

  /** Starred views leave this folder out. */
  addTrash(ownerId: string, folderId: string): void {
    this.addFolder(ownerId, folderId);
    this.trashes.add(folderId);
  }

  add(ownerId: string, summary: MessageSummary): void {
    this.messages.push({
      ownerId,
      summary,
      body: {
        v: 1,
        alg: 'x25519-xchacha20poly1305',
        sealedKey: new Uint8Array(80),
        nonce: new Uint8Array(24),
        ciphertext: Buffer.from(`body of ${summary.id}`),
      },
    });
  }

  isOwnFolder(
    ownerId: MessageOwnerId,
    folderId: MessageFolderId,
  ): Promise<boolean> {
    return Promise.resolve(this.folders.get(folderId) === ownerId);
  }

  list(
    ownerId: MessageOwnerId,
    scope: MessageScope,
    after: MessagePosition | null,
    limit: number,
  ): Promise<MessageSummary[]> {
    return Promise.resolve(
      this.own(ownerId)
        .filter((message) => this.isInScope(message, scope))
        .filter((message) => after === null || newestFirst(after, message) < 0)
        .toSorted(newestFirst)
        .slice(0, limit),
    );
  }

  find(ownerId: MessageOwnerId, id: MessageId): Promise<MessageSummary | null> {
    return Promise.resolve(
      this.own(ownerId).find((message) => message.id === id) ?? null,
    );
  }

  loadBody(
    ownerId: MessageOwnerId,
    id: MessageId,
  ): Promise<EncryptedBlob | null> {
    const stored = this.messages.find(
      (message) => message.ownerId === ownerId && message.summary.id === id,
    );
    return Promise.resolve(stored?.body ?? null);
  }

  async update(
    ownerId: MessageOwnerId,
    id: MessageId,
    changes: MessageChanges,
  ): Promise<MessageSummary | null> {
    if (
      changes.folderId !== undefined &&
      !(await this.isOwnFolder(ownerId, changes.folderId))
    ) {
      return null;
    }
    if (
      changes.labelIds?.some((labelId) => this.labels.get(labelId) !== ownerId)
    ) {
      return null;
    }
    const found = this.change(ownerId, new Set([id]), changes);
    return found === 0 ? null : this.find(ownerId, id);
  }

  async applyBatch(
    ownerId: MessageOwnerId,
    ids: readonly MessageId[],
    action: BatchAction,
  ): Promise<number | null> {
    const wanted = new Set<string>(ids);
    if (action.kind === 'delete') {
      return this.remove(ownerId, wanted);
    }
    if (action.kind === 'move') {
      return (await this.isOwnFolder(ownerId, action.folderId))
        ? this.change(ownerId, wanted, { folderId: action.folderId })
        : null;
    }
    if (action.kind === 'label' || action.kind === 'unlabel') {
      return (await this.isOwnLabel(ownerId, action.labelId))
        ? this.relabel(ownerId, wanted, action)
        : null;
    }
    return this.change(ownerId, wanted, flagChange(action.kind));
  }

  private relabel(
    ownerId: string,
    ids: ReadonlySet<string>,
    action: Extract<BatchAction, { kind: 'label' | 'unlabel' }>,
  ): number {
    let found = 0;
    this.messages = this.messages.map((message) => {
      if (message.ownerId !== ownerId || !ids.has(message.summary.id)) {
        return message;
      }
      found += 1;
      const rest = message.summary.labelIds.filter(
        (id) => id !== action.labelId,
      );
      const labelIds =
        action.kind === 'label' ? [...rest, action.labelId] : rest;
      return { ...message, summary: { ...message.summary, labelIds } };
    });
    return found;
  }

  private isInScope(message: MessageSummary, scope: MessageScope): boolean {
    switch (scope.kind) {
      case 'folder':
        return message.folderId === scope.folderId;
      case 'label':
        return (
          message.labelIds.includes(scope.labelId) &&
          !this.trashes.has(message.folderId)
        );
      case 'starred':
        return message.isStarred && !this.trashes.has(message.folderId);
    }
  }

  delete(ownerId: MessageOwnerId, id: MessageId): Promise<boolean> {
    return Promise.resolve(this.remove(ownerId, new Set([id])) > 0);
  }

  private own(ownerId: string): MessageSummary[] {
    return this.messages
      .filter((message) => message.ownerId === ownerId)
      .map((message) => message.summary);
  }

  private change(
    ownerId: string,
    ids: ReadonlySet<string>,
    changes: MessageChanges,
  ): number {
    let found = 0;
    this.messages = this.messages.map((message) => {
      if (message.ownerId !== ownerId || !ids.has(message.summary.id)) {
        return message;
      }
      found += 1;
      return { ...message, summary: { ...message.summary, ...changes } };
    });
    return found;
  }

  private remove(ownerId: string, ids: ReadonlySet<string>): number {
    const before = this.messages.length;
    this.messages = this.messages.filter(
      (message) => message.ownerId !== ownerId || !ids.has(message.summary.id),
    );
    return before - this.messages.length;
  }
}

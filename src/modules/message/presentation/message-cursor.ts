import { z } from 'zod';
import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import type {
  MessageCursor,
  MessageFolderId,
  MessageId,
  MessageLabelId,
  MessageScope,
} from '../domain/message.js';

const SEPARATOR = '|';

/**
 * Opaque to clients, but not secret: it only holds the scope and the sort
 * key (time in ms, id) of the last message they already received.
 */
const sortKey = [
  z
    .string()
    .regex(/^\d{1,15}$/)
    .transform(Number),
  z.uuid(),
] as const;

const cursorSchema = z.union([
  z.tuple([z.literal('f'), z.uuid(), ...sortKey]),
  z.tuple([z.literal('l'), z.uuid(), ...sortKey]),
  z.tuple([z.literal('s'), z.literal(''), ...sortKey]),
]);

function scopeParts(scope: MessageScope): [string, string] {
  switch (scope.kind) {
    case 'folder':
      return ['f', scope.folderId];
    case 'label':
      return ['l', scope.labelId];
    case 'starred':
      return ['s', ''];
  }
}

function scopeOf(kind: 'f' | 'l' | 's', id: string): MessageScope {
  switch (kind) {
    case 'f':
      return { kind: 'folder', folderId: id as MessageFolderId };
    case 'l':
      return { kind: 'label', labelId: id as MessageLabelId };
    case 's':
      return { kind: 'starred' };
  }
}

export function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(
    [...scopeParts(cursor.scope), cursor.receivedAt.getTime(), cursor.id].join(
      SEPARATOR,
    ),
  ).toString('base64url');
}

export function decodeCursor(raw: string): MessageCursor {
  const parts = Buffer.from(raw, 'base64url').toString('utf8').split(SEPARATOR);
  const parsed = cursorSchema.safeParse(parts);
  if (!parsed.success) {
    throw new ValidationFailedError([
      { path: 'cursor', issue: 'invalid_format' },
    ]);
  }
  const [kind, scopeId, receivedAtMs, id] = parsed.data;
  return {
    scope: scopeOf(kind, scopeId),
    receivedAt: new Date(receivedAtMs),
    id: id as MessageId,
  };
}

import { z } from 'zod';
import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import type {
  MessageCursor,
  MessageFolderId,
  MessageId,
  MessageScope,
} from '../domain/message.js';

const SEPARATOR = '|';

/**
 * Opaque to clients, but not secret: it only holds the scope and the sort
 * key (time in ms, id) of the last message they already received.
 */
const cursorSchema = z.union([
  z.tuple([
    z.literal('f'),
    z.uuid(),
    z
      .string()
      .regex(/^\d{1,15}$/)
      .transform(Number),
    z.uuid(),
  ]),
  z.tuple([
    z.literal('s'),
    z.literal(''),
    z
      .string()
      .regex(/^\d{1,15}$/)
      .transform(Number),
    z.uuid(),
  ]),
]);

function scopeParts(scope: MessageScope): [string, string] {
  switch (scope.kind) {
    case 'folder':
      return ['f', scope.folderId];
    case 'starred':
      return ['s', ''];
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
    scope:
      kind === 'f'
        ? { kind: 'folder', folderId: scopeId as MessageFolderId }
        : { kind: 'starred' },
    receivedAt: new Date(receivedAtMs),
    id: id as MessageId,
  };
}

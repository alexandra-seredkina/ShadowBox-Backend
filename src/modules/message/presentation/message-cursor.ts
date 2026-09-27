import { z } from 'zod';
import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import type {
  MessageCursor,
  MessageFolderId,
  MessageId,
} from '../domain/message.js';

const SEPARATOR = '|';

/**
 * Opaque to clients, but not secret: it only holds the folder and the sort
 * key (time in ms, id) of the last message they already received.
 */
const cursorSchema = z.tuple([
  z.uuid(),
  z
    .string()
    .regex(/^\d{1,15}$/)
    .transform(Number),
  z.uuid(),
]);

export function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(
    [cursor.folderId, cursor.receivedAt.getTime(), cursor.id].join(SEPARATOR),
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
  const [folderId, receivedAtMs, id] = parsed.data;
  return {
    folderId: folderId as MessageFolderId,
    receivedAt: new Date(receivedAtMs),
    id: id as MessageId,
  };
}

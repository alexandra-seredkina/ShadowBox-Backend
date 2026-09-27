import { z } from 'zod';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import type {
  BatchAction,
  MessageFolderId,
  MessageId,
} from '../domain/message.js';
import {
  DEFAULT_PAGE_SIZE,
  MAX_BATCH_IDS,
  MAX_PAGE_SIZE,
} from '../domain/message.js';

/** folderId stays a plain string here: a malformed one is answered with 404, see parseMessageFolderId. */
export const listMessagesQuerySchema = z.strictObject({
  folderId: z.string(),
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const updateMessageRequestSchema = z.strictObject({
  isRead: z.boolean().optional(),
  folderId: z.uuid().optional(),
});
export type UpdateMessageRequest = z.infer<typeof updateMessageRequestSchema>;

const idsSchema = z.array(z.uuid()).min(1).max(MAX_BATCH_IDS);

/** `folderId` belongs to "move" only; with any other action it is an unknown field. */
export const batchRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({
    ids: idsSchema,
    action: z.literal('move'),
    folderId: z.uuid(),
  }),
  z.strictObject({
    ids: idsSchema,
    action: z.enum(['markRead', 'markUnread', 'delete']),
  }),
]);
export type BatchRequest = z.infer<typeof batchRequestSchema>;

export function toBatchAction(request: BatchRequest): BatchAction {
  return request.action === 'move'
    ? { kind: 'move', folderId: request.folderId as MessageFolderId }
    : { kind: request.action };
}

const idSchema = z.uuid();

/** A malformed id cannot belong to anyone, so it is answered like a foreign one. */
export function parseMessageId(raw: string): MessageId {
  if (!idSchema.safeParse(raw).success) {
    throw new NotFoundError();
  }
  return raw as MessageId;
}

export function parseMessageFolderId(raw: string): MessageFolderId {
  if (!idSchema.safeParse(raw).success) {
    throw new NotFoundError();
  }
  return raw as MessageFolderId;
}

import { z } from 'zod';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { ValidationFailedError } from '../../../shared/errors/validation-failed.error.js';
import type {
  BatchAction,
  MessageFolderId,
  MessageId,
  MessageLabelId,
  MessageScope,
} from '../domain/message.js';
import {
  DEFAULT_PAGE_SIZE,
  MAX_BATCH_IDS,
  MAX_LABELS_PER_MESSAGE,
  MAX_PAGE_SIZE,
} from '../domain/message.js';

/** At most `max` UUIDs, each once. */
function distinctIds(max: number) {
  return z
    .array(z.uuid())
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length);
}

/** folderId stays a plain string here: a malformed one is answered with 404, see parseMessageFolderId. */
export const listMessagesQuerySchema = z.strictObject({
  folderId: z.string().optional(),
  labelId: z.string().optional(),
  starred: z.literal('true').optional(),
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

/** Exactly one of folderId, labelId and starred says which messages to list. */
export function toMessageScope(query: ListMessagesQuery): MessageScope {
  const given = [query.folderId, query.labelId, query.starred].filter(
    (value) => value !== undefined,
  ).length;
  if (given > 1) {
    throw new ValidationFailedError([{ path: '', issue: 'invalid_value' }]);
  }
  if (query.starred !== undefined) {
    return { kind: 'starred' };
  }
  if (query.labelId !== undefined) {
    return { kind: 'label', labelId: parseLabelId(query.labelId) };
  }
  if (query.folderId === undefined) {
    throw new ValidationFailedError([{ path: 'folderId', issue: 'required' }]);
  }
  return { kind: 'folder', folderId: parseMessageFolderId(query.folderId) };
}

export const updateMessageRequestSchema = z.strictObject({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  folderId: z.uuid().optional(),
  labelIds: distinctIds(MAX_LABELS_PER_MESSAGE).optional(),
});
export type UpdateMessageRequest = z.infer<typeof updateMessageRequestSchema>;

const idsSchema = z.array(z.uuid()).min(1).max(MAX_BATCH_IDS);

/** `folderId` belongs to "move" and `labelId` to "label"/"unlabel"; elsewhere they are unknown fields. */
export const batchRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({
    ids: idsSchema,
    action: z.literal('move'),
    folderId: z.uuid(),
  }),
  z.strictObject({
    ids: idsSchema,
    action: z.enum(['label', 'unlabel']),
    labelId: z.uuid(),
  }),
  z.strictObject({
    ids: idsSchema,
    action: z.enum(['markRead', 'markUnread', 'star', 'unstar', 'delete']),
  }),
]);
export type BatchRequest = z.infer<typeof batchRequestSchema>;

export function toBatchAction(request: BatchRequest): BatchAction {
  switch (request.action) {
    case 'move':
      return { kind: 'move', folderId: request.folderId as MessageFolderId };
    case 'label':
    case 'unlabel':
      return {
        kind: request.action,
        labelId: request.labelId as MessageLabelId,
      };
    default:
      return { kind: request.action };
  }
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

export function parseLabelId(raw: string): MessageLabelId {
  if (!idSchema.safeParse(raw).success) {
    throw new NotFoundError();
  }
  return raw as MessageLabelId;
}

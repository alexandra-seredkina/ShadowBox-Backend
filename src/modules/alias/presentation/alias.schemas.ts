import { z } from 'zod';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { metadataBlobSchema } from '../../../shared/http/encrypted-blob.schema.js';
import {
  ALIAS_STATUSES,
  ALIAS_TTLS,
  AliasId,
  AliasTtl,
} from '../domain/alias.js';

const folderIdSchema = z.uuid().nullable();
const ttlSchema = z.enum(ALIAS_TTLS as [AliasTtl, ...AliasTtl[]]);

/** `ttl` belongs to temporary addresses only; on a permanent one it is an unknown field. */
export const createAliasRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('temporary'),
    ttl: ttlSchema,
    encryptedLabel: metadataBlobSchema.nullable(),
    folderId: folderIdSchema,
  }),
  z.strictObject({
    kind: z.literal('permanent'),
    encryptedLabel: metadataBlobSchema.nullable(),
    folderId: folderIdSchema,
  }),
]);
export type CreateAliasRequest = z.infer<typeof createAliasRequestSchema>;

export const updateAliasRequestSchema = z.strictObject({
  status: z.enum(ALIAS_STATUSES).optional(),
  encryptedLabel: metadataBlobSchema.nullable().optional(),
  folderId: folderIdSchema.optional(),
});
export type UpdateAliasRequest = z.infer<typeof updateAliasRequestSchema>;

export const listAliasesQuerySchema = z.strictObject({
  status: z.enum(ALIAS_STATUSES).optional(),
});
export type ListAliasesQuery = z.infer<typeof listAliasesQuerySchema>;

const idSchema = z.uuid();

/** A malformed id cannot belong to anyone, so it is answered like a foreign one. */
export function parseAliasId(raw: string): AliasId {
  if (!idSchema.safeParse(raw).success) {
    throw new NotFoundError();
  }
  return raw as AliasId;
}

import { z } from 'zod';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { metadataBlobSchema } from '../../../shared/http/encrypted-blob.schema.js';
import type { FolderId } from '../domain/folder.js';

export const folderNameRequestSchema = z.strictObject({
  encryptedName: metadataBlobSchema,
});
export type FolderNameRequest = z.infer<typeof folderNameRequestSchema>;

const idSchema = z.uuid();

/** A malformed id cannot belong to anyone, so it is answered like a foreign one. */
export function parseFolderId(raw: string): FolderId {
  if (!idSchema.safeParse(raw).success) {
    throw new NotFoundError();
  }
  return raw as FolderId;
}

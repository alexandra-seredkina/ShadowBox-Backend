import { z } from 'zod';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { metadataBlobSchema } from '../../../shared/http/encrypted-blob.schema.js';
import type { LabelId } from '../domain/label.js';

export const labelNameRequestSchema = z.strictObject({
  encryptedName: metadataBlobSchema,
});
export type LabelNameRequest = z.infer<typeof labelNameRequestSchema>;

const idSchema = z.uuid();

/** A malformed id cannot belong to anyone, so it is answered like a foreign one. */
export function parseLabelId(raw: string): LabelId {
  if (!idSchema.safeParse(raw).success) {
    throw new NotFoundError();
  }
  return raw as LabelId;
}

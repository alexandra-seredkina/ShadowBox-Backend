import { z } from 'zod';
import { NotFoundError } from '../../../shared/errors/not-found.error.js';
import { metadataBlobSchema } from '../../../shared/http/encrypted-blob.schema.js';
import type { BlockedSenderId } from '../domain/blocked-sender.js';

const MAX_ADDRESS_LENGTH = 320;

export const blockSenderRequestSchema = z.strictObject({
  address: z
    .string()
    .min(3)
    .max(MAX_ADDRESS_LENGTH)
    .regex(/^[^@\s]+@[^@\s]+$/),
  encryptedAddress: metadataBlobSchema,
});
export type BlockSenderRequest = z.infer<typeof blockSenderRequestSchema>;

const idSchema = z.uuid();

/** A malformed id cannot belong to anyone, so it is answered like a foreign one. */
export function parseBlockedSenderId(raw: string): BlockedSenderId {
  if (!idSchema.safeParse(raw).success) {
    throw new NotFoundError();
  }
  return raw as BlockedSenderId;
}

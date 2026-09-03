import { Prisma } from '../../generated/prisma/client.js';

const UNIQUE_VIOLATION = 'P2002';

/** Name of the model whose unique constraint failed, or null for any other error. */
export function findUniqueViolationModel(error: unknown): string | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== UNIQUE_VIOLATION
  ) {
    return null;
  }
  const model = error.meta?.['modelName'];
  return typeof model === 'string' ? model : null;
}

-- AlterEnum
ALTER TYPE "folder_system_role" ADD VALUE 'archive' BEFORE 'spam';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "is_starred" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "messages_account_id_is_starred_received_at_id_idx" ON "messages"("account_id", "is_starred", "received_at" DESC, "id" DESC);

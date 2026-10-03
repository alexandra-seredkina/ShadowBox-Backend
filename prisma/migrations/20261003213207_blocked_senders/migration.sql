-- CreateTable
CREATE TABLE "blocked_senders" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "sender_hash" BYTEA NOT NULL,
    "hash_key_version" SMALLINT NOT NULL,
    "encrypted_address" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_senders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocked_senders_account_id_created_at_idx" ON "blocked_senders"("account_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "blocked_senders_account_id_sender_hash_key" ON "blocked_senders"("account_id", "sender_hash");

-- AddForeignKey
ALTER TABLE "blocked_senders" ADD CONSTRAINT "blocked_senders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


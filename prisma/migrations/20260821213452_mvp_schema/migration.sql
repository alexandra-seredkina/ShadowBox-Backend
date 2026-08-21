-- CreateEnum
CREATE TYPE "alias_kind" AS ENUM ('permanent', 'temporary');

-- CreateEnum
CREATE TYPE "alias_status" AS ENUM ('active', 'disabled', 'revoked');

-- CreateEnum
CREATE TYPE "folder_kind" AS ENUM ('system', 'custom');

-- CreateEnum
CREATE TYPE "folder_system_role" AS ENUM ('inbox', 'spam', 'trash');

-- CreateEnum
CREATE TYPE "threat_verdict" AS ENUM ('safe', 'caution', 'danger');

-- CreateEnum
CREATE TYPE "threat_marker" AS ENUM ('UNKNOWN_SENDER', 'AUTH_FAILED', 'DISPLAY_NAME_SPOOF', 'LOOKALIKE_DOMAIN', 'LINK_MISMATCH', 'DANGEROUS_ATTACHMENT');

-- CreateEnum
CREATE TYPE "auth_result" AS ENUM ('pass', 'fail', 'none');

-- CreateEnum
CREATE TYPE "pow_purpose" AS ENUM ('register', 'login');

-- DropTable
DROP TABLE "users";

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "login" VARCHAR(32) NOT NULL,
    "auth_key_hash" TEXT NOT NULL,
    "kdf_algorithm" VARCHAR(32) NOT NULL,
    "kdf_salt" BYTEA NOT NULL,
    "kdf_ops_limit" INTEGER NOT NULL,
    "kdf_mem_limit_bytes" INTEGER NOT NULL,
    "public_key" BYTEA NOT NULL,
    "encrypted_private_key_nonce" BYTEA NOT NULL,
    "encrypted_private_key_ciphertext" BYTEA NOT NULL,
    "recovery_encrypted_private_key_nonce" BYTEA NOT NULL,
    "recovery_encrypted_private_key_ciphertext" BYTEA NOT NULL,
    "is_ip_binding_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "ip_hash" BYTEA NOT NULL,
    "ip_hash_key_version" SMALLINT NOT NULL,
    "is_ip_bound" BOOLEAN NOT NULL,
    "device" VARCHAR(64) NOT NULL,
    "reauth_until" TIMESTAMPTZ(3),
    "last_active_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aliases" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID,
    "local_part" VARCHAR(64) NOT NULL,
    "domain" VARCHAR(253) NOT NULL,
    "kind" "alias_kind" NOT NULL,
    "status" "alias_status" NOT NULL DEFAULT 'active',
    "encrypted_label" JSONB,
    "folder_id" UUID,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "last_received_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "kind" "folder_kind" NOT NULL,
    "system_role" "folder_system_role",
    "encrypted_name" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "folder_id" UUID NOT NULL,
    "alias_id" UUID,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "size_bytes" INTEGER NOT NULL,
    "threat_verdict" "threat_verdict" NOT NULL,
    "threat_markers" "threat_marker"[] DEFAULT ARRAY[]::"threat_marker"[],
    "spf_result" "auth_result" NOT NULL,
    "dkim_result" "auth_result" NOT NULL,
    "dmarc_result" "auth_result" NOT NULL,
    "encrypted_preview" JSONB NOT NULL,
    "body_blob_version" SMALLINT NOT NULL,
    "body_sealed_key" BYTEA NOT NULL,
    "body_nonce" BYTEA NOT NULL,
    "body_ciphertext" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "known_senders" (
    "account_id" UUID NOT NULL,
    "sender_hash" BYTEA NOT NULL,
    "hash_key_version" SMALLINT NOT NULL,

    CONSTRAINT "known_senders_pkey" PRIMARY KEY ("account_id","sender_hash")
);

-- CreateTable
CREATE TABLE "pow_challenges" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "purpose" "pow_purpose" NOT NULL,
    "prefix" BYTEA NOT NULL,
    "difficulty" SMALLINT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pow_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" UUID NOT NULL,
    "account_id" UUID,
    "operation" VARCHAR(64) NOT NULL,
    "request_hash" BYTEA NOT NULL,
    "response_status" SMALLINT NOT NULL,
    "response_body" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_login_key" ON "accounts"("login");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_account_id_idx" ON "sessions"("account_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "aliases_account_id_status_created_at_idx" ON "aliases"("account_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "aliases_status_expires_at_idx" ON "aliases"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "aliases_local_part_domain_key" ON "aliases"("local_part", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "folders_id_account_id_key" ON "folders"("id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "folders_account_id_system_role_key" ON "folders"("account_id", "system_role");

-- CreateIndex
CREATE INDEX "messages_account_id_folder_id_received_at_id_idx" ON "messages"("account_id", "folder_id", "received_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "messages_folder_id_is_read_idx" ON "messages"("folder_id", "is_read");

-- CreateIndex
CREATE INDEX "pow_challenges_expires_at_idx" ON "pow_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE INDEX "idempotency_records_account_id_idx" ON "idempotency_records"("account_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_folder_id_account_id_fkey" FOREIGN KEY ("folder_id", "account_id") REFERENCES "folders"("id", "account_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_alias_id_fkey" FOREIGN KEY ("alias_id") REFERENCES "aliases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "known_senders" ADD CONSTRAINT "known_senders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Invariants Prisma cannot express
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_expiry_matches_kind_check" CHECK (("kind" = 'temporary') = ("expires_at" IS NOT NULL));
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_revoked_at_matches_status_check" CHECK (("status" = 'revoked') = ("revoked_at" IS NOT NULL));
ALTER TABLE "folders" ADD CONSTRAINT "folders_system_role_matches_kind_check" CHECK (("kind" = 'system') = ("system_role" IS NOT NULL));
ALTER TABLE "folders" ADD CONSTRAINT "folders_name_matches_kind_check" CHECK (("kind" = 'custom') = ("encrypted_name" IS NOT NULL));
ALTER TABLE "messages" ADD CONSTRAINT "messages_size_bytes_check" CHECK ("size_bytes" >= 0);

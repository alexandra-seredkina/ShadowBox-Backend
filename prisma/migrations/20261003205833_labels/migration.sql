-- CreateTable
CREATE TABLE "labels" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "encrypted_name" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_labels" (
    "message_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "message_labels_pkey" PRIMARY KEY ("message_id","label_id")
);

-- CreateTable
CREATE TABLE "alias_labels" (
    "alias_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "alias_labels_pkey" PRIMARY KEY ("alias_id","label_id")
);

-- CreateIndex
CREATE INDEX "labels_account_id_created_at_idx" ON "labels"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "message_labels_label_id_idx" ON "message_labels"("label_id");

-- CreateIndex
CREATE INDEX "alias_labels_label_id_idx" ON "alias_labels"("label_id");

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alias_labels" ADD CONSTRAINT "alias_labels_alias_id_fkey" FOREIGN KEY ("alias_id") REFERENCES "aliases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alias_labels" ADD CONSTRAINT "alias_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;


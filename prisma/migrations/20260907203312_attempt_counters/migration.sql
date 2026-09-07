-- CreateTable
CREATE TABLE "attempt_counters" (
    "key" BYTEA NOT NULL,
    "count" INTEGER NOT NULL,
    "window_ends_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attempt_counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "attempt_counters_window_ends_at_idx" ON "attempt_counters"("window_ends_at");


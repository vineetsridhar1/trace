-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- Seed default "general" thread
INSERT INTO "threads" ("id", "name", "updated_at") VALUES ('00000000-0000-0000-0000-000000000001', 'general', CURRENT_TIMESTAMP);

-- AlterTable: add columns with defaults so existing rows are handled
ALTER TABLE "events" ADD COLUMN "importance" TEXT NOT NULL DEFAULT 'non-important';
ALTER TABLE "events" ADD COLUMN "thread_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- Remove the default after backfilling
ALTER TABLE "events" ALTER COLUMN "thread_id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "events_thread_id_timestamp_idx" ON "events"("thread_id", "timestamp");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

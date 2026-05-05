ALTER TYPE "EventType" ADD VALUE 'session_group_saved_for_later';

ALTER TABLE "SessionGroup" ADD COLUMN "savedAt" TIMESTAMP(3);

CREATE INDEX "SessionGroup_channelId_savedAt_idx" ON "SessionGroup"("channelId", "savedAt");

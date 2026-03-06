-- Step 1: Drop the FK from events -> threads (old Thread model)
ALTER TABLE "events" DROP CONSTRAINT "events_thread_id_fkey";

-- Step 2: Rename "threads" table to "channels"
ALTER TABLE "threads" RENAME TO "channels";
ALTER TABLE "channels" RENAME CONSTRAINT "threads_pkey" TO "channels_pkey";

-- Step 3: Create "messages" table
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "preview" TEXT,
    "importance" TEXT NOT NULL DEFAULT 'non-important',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- Step 4: Create new "threads" table (Thread under Message)
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- Step 5: Migrate existing events — group by session_id, create messages + threads
-- For each distinct session in events, create a message in the default channel
INSERT INTO "messages" ("id", "channel_id", "session_id", "preview", "importance", "created_at")
SELECT
    gen_random_uuid()::text,
    '00000000-0000-0000-0000-000000000001',
    e."session_id",
    (SELECT e2."last_assistant_message" FROM "events" e2 WHERE e2."session_id" = e."session_id" AND e2."last_assistant_message" IS NOT NULL ORDER BY e2."timestamp" DESC LIMIT 1),
    CASE WHEN EXISTS (
        SELECT 1 FROM "events" e3
        WHERE e3."session_id" = e."session_id"
        AND e3."hook_event_name" IN ('UserPromptSubmit', 'Stop')
    ) THEN 'important' ELSE 'non-important' END,
    MIN(e."timestamp")
FROM "events" e
GROUP BY e."session_id";

-- For each message, create a thread
INSERT INTO "threads" ("id", "message_id", "created_at")
SELECT
    gen_random_uuid()::text,
    m."id",
    m."created_at"
FROM "messages" m;

-- Step 6: Drop old thread_id index before updating
DROP INDEX "events_thread_id_timestamp_idx";

-- Step 7: Update events.thread_id to point to the new thread (via message -> session)
UPDATE "events" e
SET "thread_id" = t."id"
FROM "threads" t
JOIN "messages" m ON t."message_id" = m."id"
WHERE m."session_id" = e."session_id";

-- Step 8: Add indexes and foreign keys
CREATE INDEX "messages_channel_id_created_at_idx" ON "messages"("channel_id", "created_at");

ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "threads" ADD CONSTRAINT "threads_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "events_thread_id_timestamp_idx" ON "events"("thread_id", "timestamp");

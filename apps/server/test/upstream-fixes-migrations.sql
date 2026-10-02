-- Uses temporary tables and rolls back every schema and data change.
-- Run with psql -X -v ON_ERROR_STOP=1 -d <test database> -f <this file>.
BEGIN;
CREATE SCHEMA trace_goose_upstream_migration_test;
SET LOCAL search_path = trace_goose_upstream_migration_test, pg_temp;

CREATE TEMP TABLE "SlackProcessedEvent" (id text PRIMARY KEY);
\ir ../prisma/migrations/20260912170000_add_slack_message_dedupe_key/migration.sql
INSERT INTO "SlackProcessedEvent" VALUES ('mention', 'team:channel:timestamp');
DO $$
BEGIN
  BEGIN
    INSERT INTO "SlackProcessedEvent" VALUES ('message', 'team:channel:timestamp');
    RAISE EXCEPTION 'Duplicate Slack message was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

CREATE TEMP TABLE "SessionApplicationProcess" (id text PRIMARY KEY);
CREATE TEMP TABLE "SessionApplicationLogEntry" (
  "processId" text REFERENCES "SessionApplicationProcess"(id),
  sequence integer NOT NULL,
  UNIQUE ("processId", sequence)
);
INSERT INTO "SessionApplicationProcess" VALUES ('existing'), ('new');
INSERT INTO "SessionApplicationLogEntry" VALUES ('existing', 7);
\ir ../prisma/migrations/20260930120000_add_process_log_sequence/migration.sql

-- Old replicas propose their own sequence; new replicas supply zero.
INSERT INTO "SessionApplicationLogEntry" VALUES ('existing', 8), ('existing', 0), ('existing', 8);
INSERT INTO "SessionApplicationLogEntry" VALUES ('new', 0), ('new', 0);
DO $$
BEGIN
  IF (SELECT array_agg(sequence ORDER BY sequence) FROM "SessionApplicationLogEntry"
      WHERE "processId" = 'existing') IS DISTINCT FROM ARRAY[7, 8, 9, 10] THEN
    RAISE EXCEPTION 'Mixed-version log inserts did not receive unique increasing sequences';
  END IF;
  IF (SELECT "logSequence" FROM "SessionApplicationProcess" WHERE id = 'existing') <> 10
      OR (SELECT "logSequence" FROM "SessionApplicationProcess" WHERE id = 'new') <> 2 THEN
    RAISE EXCEPTION 'Log sequence counters do not match allocated entries';
  END IF;
END $$;
ROLLBACK;

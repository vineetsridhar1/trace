-- Run with psql -X -v ON_ERROR_STOP=1 -d <test database> -f <this file>.
-- Only temporary tables are modified; all changes are rolled back.
BEGIN;
SET LOCAL search_path = pg_temp;
CREATE TEMP TABLE "SessionGroup" (id text PRIMARY KEY, connection jsonb);
CREATE TEMP TABLE "Session" (id text PRIMARY KEY, "sessionGroupId" text, connection jsonb, "updatedAt" timestamptz);
INSERT INTO "SessionGroup" VALUES
  ('canonical', '{"runtimeInstanceId":"new","version":1}'),
  ('missing', NULL),
  ('json-null', 'null'),
  ('cleared', '{}');
INSERT INTO "Session" VALUES
  ('stale', 'canonical', '{"runtimeInstanceId":"old","version":999}', now()),
  ('legacy', 'missing', '{"runtimeInstanceId":"legacy","version":2}', now()),
  ('legacy-json', 'json-null', '{"runtimeInstanceId":"legacy-json"}', now()),
  ('cleared-stale', 'cleared', '{"runtimeInstanceId":"old"}', now());
\ir ../prisma/migrations/20260909120000_session_group_runtime_authority/migration.sql
DO $$
BEGIN
  IF (SELECT connection->>'runtimeInstanceId' FROM "SessionGroup" WHERE id = 'canonical') <> 'new' THEN
    RAISE EXCEPTION 'A stale session replaced the canonical runtime';
  END IF;
  IF (SELECT connection->>'runtimeInstanceId' FROM "SessionGroup" WHERE id = 'missing') IS DISTINCT FROM 'legacy'
    OR (SELECT connection->>'runtimeInstanceId' FROM "SessionGroup" WHERE id = 'json-null') IS DISTINCT FROM 'legacy-json' THEN
    RAISE EXCEPTION 'Unambiguous legacy ownership was not backfilled';
  END IF;
  IF (SELECT connection FROM "SessionGroup" WHERE id = 'cleared') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'A cleared group runtime was resurrected';
  END IF;
  IF EXISTS (SELECT 1 FROM "Session" s JOIN "SessionGroup" g ON g.id = s."sessionGroupId" WHERE s.connection IS DISTINCT FROM g.connection) THEN
    RAISE EXCEPTION 'Session projections disagree with canonical ownership';
  END IF;
END $$;
ROLLBACK;

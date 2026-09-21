-- SessionGroup.connection is now the authoritative runtime lifecycle record.
-- Drain old API writers before applying this migration and start only upgraded
-- replicas afterward. A one-way projection cannot fence old-version writers.
-- Session and group version counters are independent: never compare them or
-- let a stale session resurrect an existing group's replaced runtime.
-- Missing group records can only be recovered when ownership is unambiguous.
DO $$
BEGIN
  IF EXISTS (
    SELECT g.id
    FROM "SessionGroup" g JOIN "Session" s ON s."sessionGroupId" = g.id
    WHERE g.connection IS NULL OR g.connection = 'null'::jsonb
    GROUP BY g.id
    HAVING COUNT(DISTINCT s.connection->>'runtimeInstanceId') > 1
      OR COUNT(DISTINCT s.connection->>'providerRuntimeId') > 1
  ) THEN
    RAISE EXCEPTION 'Ambiguous legacy group runtime ownership; reconcile missing group connections before retrying';
  END IF;
END $$;
WITH ranked_session_connections AS (
  SELECT DISTINCT ON (s."sessionGroupId")
    s."sessionGroupId",
    s.connection
  FROM "Session" AS s
  WHERE s."sessionGroupId" IS NOT NULL
    AND s.connection IS NOT NULL AND s.connection <> 'null'::jsonb
  ORDER BY
    s."sessionGroupId",
    s."updatedAt" DESC,
    s.id DESC
)
UPDATE "SessionGroup" AS g
SET connection = ranked.connection
FROM ranked_session_connections AS ranked
WHERE g.id = ranked."sessionGroupId"
  AND (
    g.connection IS NULL
    OR g.connection = 'null'::jsonb
  );

-- Compatibility projection, not a mixed-version rollout safety mechanism.
UPDATE "Session" AS s
SET connection = g.connection
FROM "SessionGroup" AS g
WHERE s."sessionGroupId" = g.id
  AND g.connection IS NOT NULL
  AND s.connection IS DISTINCT FROM g.connection;

CREATE INDEX "SessionGroup_connection_deprovision_idx"
  ON "SessionGroup" ((connection->>'state'))
  WHERE connection->>'adapterType' = 'provisioned'
    AND connection->>'state' IN ('stopping', 'deprovision_failed');

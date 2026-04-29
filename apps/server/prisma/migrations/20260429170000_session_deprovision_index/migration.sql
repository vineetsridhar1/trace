-- Partial index that powers SessionService.reconcileStuckDeprovisions.
-- The reconciler runs every 30s and scans for provisioned sessions whose
-- connection.state is in {stopping, deprovision_failed}. Without this index
-- the query is a sequential scan of the Session table on every tick. The
-- partial form keeps the index small because most sessions are not in a
-- deprovision state.
CREATE INDEX "Session_deprovision_reconcile_idx"
  ON "Session" ((connection->>'state'))
  WHERE connection->>'adapterType' = 'provisioned'
    AND connection->>'state' IN ('stopping', 'deprovision_failed');

-- Backfill `connection.version = 0` on any session whose connection JSON is
-- non-null and has no version key yet. The optimistic-locking helper in
-- SessionService.updateConnectionConditional uses
-- `WHERE connection->'version' = expectedVersion` for conditional updates;
-- rows that predate the version field would silently never match. Setting
-- the baseline to 0 means new writers can compare-and-swap from the start.
UPDATE "Session"
SET connection = jsonb_set(connection, '{version}', '0', true)
WHERE connection IS NOT NULL
  AND NOT (connection ? 'version');

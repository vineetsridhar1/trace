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

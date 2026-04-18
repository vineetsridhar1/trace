-- At most one pending access request per (bridge, requester) pair at any time.
-- The supersede-on-new-scope flow relies on this constraint to race-safely
-- ensure that two concurrent requests can't both land in "pending".
CREATE UNIQUE INDEX "BridgeAccessRequest_pending_per_requester"
  ON "BridgeAccessRequest" ("bridgeRuntimeId", "requesterUserId")
  WHERE "status" = 'pending';

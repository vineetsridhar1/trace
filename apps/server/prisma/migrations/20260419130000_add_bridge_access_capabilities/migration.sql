-- CreateEnum
CREATE TYPE "BridgeAccessCapability" AS ENUM ('session', 'terminal');

-- Add capabilities to existing grants. Existing grants are upgraded to the
-- full capability set so that pre-migration behavior is preserved end-to-end.
ALTER TABLE "BridgeAccessGrant"
  ADD COLUMN "capabilities" "BridgeAccessCapability"[] NOT NULL
  DEFAULT ARRAY['session','terminal']::"BridgeAccessCapability"[];

-- Drop the default so new grants must explicitly supply capabilities. The
-- service layer is the sole creator of grants (via approveRequest/updateGrant)
-- and always supplies the capability set — defaulting here would silently
-- undermine the "deny terminal by default on new approvals" guarantee.
ALTER TABLE "BridgeAccessGrant"
  ALTER COLUMN "capabilities" DROP DEFAULT;

-- Add requestedCapabilities to existing pending requests. Existing pending
-- requests predate the capability selector and are upgraded to the full set
-- so owners see what the old UI would have asked for.
ALTER TABLE "BridgeAccessRequest"
  ADD COLUMN "requestedCapabilities" "BridgeAccessCapability"[] NOT NULL
  DEFAULT ARRAY['session','terminal']::"BridgeAccessCapability"[];

-- Drop the default so new requests are always explicit. The service layer
-- normalizes missing/empty to ['session'].
ALTER TABLE "BridgeAccessRequest"
  ALTER COLUMN "requestedCapabilities" DROP DEFAULT;

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'bridge_access_updated';

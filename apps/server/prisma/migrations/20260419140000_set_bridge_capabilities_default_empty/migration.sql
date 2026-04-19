-- AlterTable
ALTER TABLE "BridgeAccessGrant" ALTER COLUMN "capabilities" SET DEFAULT ARRAY[]::"BridgeAccessCapability"[];

-- AlterTable
ALTER TABLE "BridgeAccessRequest" ALTER COLUMN "requestedCapabilities" SET DEFAULT ARRAY[]::"BridgeAccessCapability"[];

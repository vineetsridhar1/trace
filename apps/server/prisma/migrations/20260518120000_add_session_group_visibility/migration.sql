CREATE TYPE "SessionGroupVisibility" AS ENUM ('public', 'private');

ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'session_group_visibility_updated';

ALTER TABLE "SessionGroup"
ADD COLUMN "visibility" "SessionGroupVisibility" NOT NULL DEFAULT 'public',
ADD COLUMN "ownerUserId" TEXT;

-- Existing groups are public. Ownership is backfilled from the earliest
-- session creator in the group so privacy later has a stable group owner.
UPDATE "SessionGroup" AS sg
SET "ownerUserId" = earliest."createdById"
FROM (
  SELECT DISTINCT ON ("sessionGroupId")
    "sessionGroupId",
    "createdById"
  FROM "Session"
  WHERE "sessionGroupId" IS NOT NULL
  ORDER BY "sessionGroupId", "createdAt" ASC, "updatedAt" ASC
) AS earliest
WHERE sg."id" = earliest."sessionGroupId";

-- Legacy empty groups have no session creator. Use the earliest org member
-- as the least surprising valid owner within the same organization.
UPDATE "SessionGroup" AS sg
SET "ownerUserId" = fallback."userId"
FROM (
  SELECT DISTINCT ON ("organizationId")
    "organizationId",
    "userId"
  FROM "OrgMember"
  ORDER BY "organizationId", "joinedAt" ASC
) AS fallback
WHERE sg."ownerUserId" IS NULL
  AND sg."organizationId" = fallback."organizationId";

ALTER TABLE "SessionGroup"
ALTER COLUMN "ownerUserId" SET NOT NULL;

ALTER TABLE "SessionGroup"
ADD CONSTRAINT "SessionGroup_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "SessionGroup_organizationId_visibility_ownerUserId_idx"
ON "SessionGroup"("organizationId", "visibility", "ownerUserId");

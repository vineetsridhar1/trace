ALTER TABLE "SessionGroup"
ADD COLUMN "repoId" TEXT,
ADD COLUMN "branch" TEXT;

UPDATE "SessionGroup" AS sg
SET
  "repoId" = latest."repoId",
  "branch" = latest."branch"
FROM (
  SELECT DISTINCT ON ("sessionGroupId")
    "sessionGroupId",
    "repoId",
    "branch"
  FROM "Session"
  WHERE "sessionGroupId" IS NOT NULL
  ORDER BY "sessionGroupId", "updatedAt" DESC, "createdAt" DESC
) AS latest
WHERE sg."id" = latest."sessionGroupId";

ALTER TABLE "SessionGroup"
ADD CONSTRAINT "SessionGroup_repoId_fkey"
FOREIGN KEY ("repoId") REFERENCES "Repo"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "SessionGroup_repoId_branch_updatedAt_idx"
ON "SessionGroup"("repoId", "branch", "updatedAt");

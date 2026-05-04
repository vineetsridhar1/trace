ALTER TYPE "ScopeType" ADD VALUE 'project';

ALTER TYPE "EventType" ADD VALUE 'project_created';
ALTER TYPE "EventType" ADD VALUE 'project_updated';
ALTER TYPE "EventType" ADD VALUE 'project_member_added';
ALTER TYPE "EventType" ADD VALUE 'project_member_removed';

CREATE TABLE "ProjectMember" (
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'member',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),

  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId", "userId")
);

CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");
CREATE INDEX "ProjectMember_projectId_leftAt_idx" ON "ProjectMember"("projectId", "leftAt");

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ProjectMember" ("projectId", "userId", "role", "joinedAt")
SELECT
  p."id",
  om."userId",
  'admin'::"UserRole",
  p."createdAt"
FROM "Project" p
JOIN "OrgMember" om
  ON om."organizationId" = p."organizationId"
WHERE om."role" = 'admin'::"UserRole"
ON CONFLICT ("projectId", "userId") DO NOTHING;

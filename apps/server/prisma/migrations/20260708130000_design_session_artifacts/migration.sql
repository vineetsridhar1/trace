CREATE TYPE "SessionGroupKind" AS ENUM ('coding', 'design', 'app');

ALTER TABLE "SessionGroup"
ADD COLUMN "kind" "SessionGroupKind" NOT NULL DEFAULT 'coding';

ALTER TYPE "EventType" ADD VALUE 'design_artifact_created';
ALTER TYPE "EventType" ADD VALUE 'design_artifact_updated';

CREATE TABLE "Artifact" (
  "id" TEXT NOT NULL,
  "sessionGroupId" TEXT NOT NULL,
  "parentArtifactId" TEXT,
  "organizationId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "promptEventId" TEXT,
  "prompt" TEXT,
  "title" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "metadata" JSONB,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Artifact_organizationId_sessionGroupId_createdAt_idx"
ON "Artifact"("organizationId", "sessionGroupId", "createdAt");

CREATE INDEX "Artifact_parentArtifactId_idx"
ON "Artifact"("parentArtifactId");

CREATE INDEX "Artifact_promptEventId_idx"
ON "Artifact"("promptEventId");

ALTER TABLE "Artifact"
ADD CONSTRAINT "Artifact_sessionGroupId_fkey"
FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Artifact"
ADD CONSTRAINT "Artifact_parentArtifactId_fkey"
FOREIGN KEY ("parentArtifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Artifact"
ADD CONSTRAINT "Artifact_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Artifact"
ADD CONSTRAINT "Artifact_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

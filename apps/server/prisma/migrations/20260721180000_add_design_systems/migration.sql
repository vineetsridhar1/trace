ALTER TYPE "SessionGroupKind" ADD VALUE 'design_system';
ALTER TYPE "EventType" ADD VALUE 'design_system_created';
ALTER TYPE "EventType" ADD VALUE 'design_system_commit_artifact_created';
ALTER TYPE "EventType" ADD VALUE 'design_system_commit_artifact_updated';
ALTER TYPE "EventType" ADD VALUE 'design_system_version_created';
ALTER TYPE "EventType" ADD VALUE 'design_system_updated';
ALTER TYPE "EventType" ADD VALUE 'design_system_publish_updated';
ALTER TYPE "EventType" ADD VALUE 'design_system_archived';

CREATE TYPE "DesignSystemStatus" AS ENUM ('draft', 'ready', 'archived');
CREATE TYPE "DesignSystemCommitArtifactStatus" AS ENUM ('pending', 'saving', 'saved', 'failed');
CREATE TYPE "DesignSystemPublishStatus" AS ENUM ('idle', 'publishing', 'published', 'failed');

ALTER TABLE "SessionGroup" ADD COLUMN "designSystemVersionId" TEXT;

CREATE TABLE "DesignSystem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "status" "DesignSystemStatus" NOT NULL DEFAULT 'draft',
  "sourceRepoId" TEXT,
    "sourceBranch" TEXT,
    "sourcePath" TEXT,
    "sourceCommitSha" TEXT,
  "activeVersionId" TEXT,
  "latestCommitArtifactId" TEXT,
  "latestPushedCommitSha" TEXT,
  "authoringSessionGroupId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "commitArtifactStatus" "DesignSystemCommitArtifactStatus",
  "commitArtifactError" TEXT,
  "publishStatus" "DesignSystemPublishStatus" NOT NULL DEFAULT 'idle',
  "publishedCommitSha" TEXT,
  "publishAttemptedAt" TIMESTAMP(3),
  "publishError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "DesignSystem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesignSystemCommitArtifact" (
  "id" TEXT NOT NULL,
  "designSystemId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentDigest" TEXT,
  "byteSize" INTEGER,
  "commitSha" TEXT NOT NULL,
  "status" "DesignSystemCommitArtifactStatus" NOT NULL DEFAULT 'pending',
  "packageValid" BOOLEAN,
  "packageDigest" TEXT,
  "validationSummary" JSONB,
  "error" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "savedAt" TIMESTAMP(3),
  CONSTRAINT "DesignSystemCommitArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesignSystemVersion" (
  "id" TEXT NOT NULL,
  "designSystemId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentDigest" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sourceCommitSha" TEXT,
  "authoringSessionGroupId" TEXT NOT NULL,
  "designSystemCommitArtifactId" TEXT NOT NULL,
  "workbenchCommitSha" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "validationSummary" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DesignSystemVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DesignSystem_organizationId_slug_key" ON "DesignSystem"("organizationId", "slug");
CREATE UNIQUE INDEX "DesignSystem_activeVersionId_key" ON "DesignSystem"("activeVersionId");
CREATE UNIQUE INDEX "DesignSystem_latestCommitArtifactId_key" ON "DesignSystem"("latestCommitArtifactId");
CREATE UNIQUE INDEX "DesignSystem_authoringSessionGroupId_key" ON "DesignSystem"("authoringSessionGroupId");
CREATE INDEX "DesignSystem_organizationId_status_updatedAt_idx" ON "DesignSystem"("organizationId", "status", "updatedAt");
CREATE INDEX "DesignSystem_sourceRepoId_idx" ON "DesignSystem"("sourceRepoId");
CREATE UNIQUE INDEX "DesignSystemCommitArtifact_designSystemId_sequence_key" ON "DesignSystemCommitArtifact"("designSystemId", "sequence");
CREATE UNIQUE INDEX "DesignSystemCommitArtifact_designSystemId_commitSha_key" ON "DesignSystemCommitArtifact"("designSystemId", "commitSha");
CREATE INDEX "DesignSystemCommitArtifact_designSystemId_createdAt_idx" ON "DesignSystemCommitArtifact"("designSystemId", "createdAt");
CREATE UNIQUE INDEX "DesignSystemVersion_designSystemCommitArtifactId_key" ON "DesignSystemVersion"("designSystemCommitArtifactId");
CREATE UNIQUE INDEX "DesignSystemVersion_designSystemId_version_key" ON "DesignSystemVersion"("designSystemId", "version");
CREATE UNIQUE INDEX "DesignSystemVersion_designSystemId_contentDigest_key" ON "DesignSystemVersion"("designSystemId", "contentDigest");
CREATE INDEX "DesignSystemVersion_designSystemId_createdAt_idx" ON "DesignSystemVersion"("designSystemId", "createdAt");
CREATE INDEX "DesignSystemVersion_authoringSessionGroupId_idx" ON "DesignSystemVersion"("authoringSessionGroupId");
CREATE INDEX "SessionGroup_designSystemVersionId_idx" ON "SessionGroup"("designSystemVersionId");

ALTER TABLE "DesignSystem" ADD CONSTRAINT "DesignSystem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignSystem" ADD CONSTRAINT "DesignSystem_sourceRepoId_fkey" FOREIGN KEY ("sourceRepoId") REFERENCES "Repo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DesignSystem" ADD CONSTRAINT "DesignSystem_authoringSessionGroupId_fkey" FOREIGN KEY ("authoringSessionGroupId") REFERENCES "SessionGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DesignSystem" ADD CONSTRAINT "DesignSystem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DesignSystemCommitArtifact" ADD CONSTRAINT "DesignSystemCommitArtifact_designSystemId_fkey" FOREIGN KEY ("designSystemId") REFERENCES "DesignSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignSystemCommitArtifact" ADD CONSTRAINT "DesignSystemCommitArtifact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DesignSystemVersion" ADD CONSTRAINT "DesignSystemVersion_designSystemId_fkey" FOREIGN KEY ("designSystemId") REFERENCES "DesignSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DesignSystemVersion" ADD CONSTRAINT "DesignSystemVersion_designSystemCommitArtifactId_fkey" FOREIGN KEY ("designSystemCommitArtifactId") REFERENCES "DesignSystemCommitArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DesignSystemVersion" ADD CONSTRAINT "DesignSystemVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DesignSystem" ADD CONSTRAINT "DesignSystem_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "DesignSystemVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DesignSystem" ADD CONSTRAINT "DesignSystem_latestCommitArtifactId_fkey" FOREIGN KEY ("latestCommitArtifactId") REFERENCES "DesignSystemCommitArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionGroup" ADD CONSTRAINT "SessionGroup_designSystemVersionId_fkey" FOREIGN KEY ("designSystemVersionId") REFERENCES "DesignSystemVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

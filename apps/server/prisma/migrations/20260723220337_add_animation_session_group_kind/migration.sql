-- AlterEnum
ALTER TYPE "SessionGroupKind" ADD VALUE 'animation';

-- CreateIndex
CREATE INDEX "DesignSystemVersion_designSystemCommitArtifactId_idx" ON "DesignSystemVersion"("designSystemCommitArtifactId");

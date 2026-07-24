-- AlterEnum
ALTER TYPE "SessionGroupKind" ADD VALUE 'animation';

-- CreateIndex
-- IF NOT EXISTS: this index was already declared in schema.prisma before this
-- migration (pre-existing drift, unrelated to the animation kind) and had
-- already been applied out-of-band on some databases via `db push`. Without
-- this guard, CREATE INDEX fails there, and since Postgres rolls back the
-- whole migration transaction on any statement failure, it silently undid the
-- enum addition above too.
CREATE INDEX IF NOT EXISTS "DesignSystemVersion_designSystemCommitArtifactId_idx" ON "DesignSystemVersion"("designSystemCommitArtifactId");

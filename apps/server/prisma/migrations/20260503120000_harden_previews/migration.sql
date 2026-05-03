ALTER TABLE "Preview" ADD COLUMN "createdByActorType" "ActorType" NOT NULL DEFAULT 'user';
ALTER TABLE "Preview" ADD COLUMN "createdByActorId" TEXT;

UPDATE "Preview" SET "createdByActorId" = "createdById";

ALTER TABLE "Preview" ALTER COLUMN "createdByActorId" SET NOT NULL;
ALTER TABLE "Preview" ALTER COLUMN "createdByActorType" DROP DEFAULT;

DROP INDEX IF EXISTS "Preview_createdById_createdAt_idx";
ALTER TABLE "Preview" DROP CONSTRAINT IF EXISTS "Preview_createdById_fkey";
ALTER TABLE "Preview" DROP COLUMN "createdById";

CREATE INDEX "Preview_createdByActorType_createdByActorId_createdAt_idx" ON "Preview"("createdByActorType", "createdByActorId", "createdAt");
CREATE UNIQUE INDEX "Preview_one_active_per_session_idx" ON "Preview"("organizationId", "sessionId") WHERE "status" IN ('starting', 'ready', 'stopping');

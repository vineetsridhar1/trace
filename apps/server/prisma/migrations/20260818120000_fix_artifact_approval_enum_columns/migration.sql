-- Databases whose history includes the OSS 20260802090000_add_artifact_approval_state
-- migration already had "approvalStatus" / "approvalAction" as TEXT (with lowercase
-- status values). The ADD COLUMN IF NOT EXISTS guards in
-- 20260817180000_add_artifact_approval therefore skipped them, leaving the columns as
-- TEXT while the Prisma schema declares them as enums. Convert them here.
-- Databases where 20260817180000 created the columns are already correct and skipped.

DO $$
BEGIN
  IF to_regtype('"ArtifactApprovalStatus"') IS NULL THEN
    CREATE TYPE "ArtifactApprovalStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPROVED');
  END IF;
  IF to_regtype('"ArtifactApprovalAction"') IS NULL THEN
    CREATE TYPE "ArtifactApprovalAction" AS ENUM ('NEW_SESSION', 'KEEP_CONTEXT');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Artifact'
      AND column_name = 'approvalStatus'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE "Artifact" ALTER COLUMN "approvalStatus" DROP DEFAULT;
    ALTER TABLE "Artifact" ALTER COLUMN "approvalStatus" DROP NOT NULL;

    -- The TEXT column defaulted every artifact to 'pending'; only visual plans
    -- carry an approval state under the enum schema.
    UPDATE "Artifact"
    SET "approvalStatus" = CASE
      WHEN "type" <> 'trace.visual-plan.v1' THEN NULL
      WHEN upper("approvalStatus") IN ('PENDING', 'PROCESSING', 'APPROVED') THEN upper("approvalStatus")
      ELSE NULL
    END;

    ALTER TABLE "Artifact"
    ALTER COLUMN "approvalStatus" TYPE "ArtifactApprovalStatus"
    USING "approvalStatus"::"ArtifactApprovalStatus";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Artifact'
      AND column_name = 'approvalAction'
      AND data_type = 'text'
  ) THEN
    UPDATE "Artifact"
    SET "approvalAction" = CASE
      WHEN upper("approvalAction") IN ('NEW_SESSION', 'KEEP_CONTEXT') THEN upper("approvalAction")
      ELSE NULL
    END
    WHERE "approvalAction" IS NOT NULL;

    ALTER TABLE "Artifact"
    ALTER COLUMN "approvalAction" TYPE "ArtifactApprovalAction"
    USING "approvalAction"::"ArtifactApprovalAction";
  END IF;
END $$;

UPDATE "Artifact"
SET "approvalStatus" = 'PENDING'
WHERE "type" = 'trace.visual-plan.v1' AND "approvalStatus" IS NULL;

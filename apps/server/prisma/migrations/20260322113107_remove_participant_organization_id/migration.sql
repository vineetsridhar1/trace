DROP TRIGGER IF EXISTS "Participant_validate_scope_organization" ON "Participant";
DROP FUNCTION IF EXISTS "validate_participant_scope_organization"();

ALTER TABLE "Participant" DROP CONSTRAINT IF EXISTS "Participant_organizationId_fkey";

DROP INDEX IF EXISTS "Participant_organizationId_userId_idx";

ALTER TABLE "Participant" DROP COLUMN IF EXISTS "organizationId";

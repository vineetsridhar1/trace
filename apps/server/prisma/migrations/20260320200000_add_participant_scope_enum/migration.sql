-- CreateEnum
CREATE TYPE "ParticipantScope" AS ENUM ('channel', 'chat', 'session', 'ticket', 'thread', 'system');

-- Drop trigger and function that depend on scopeType column
DROP TRIGGER IF EXISTS "Participant_validate_scope_organization" ON "Participant";
DROP FUNCTION IF EXISTS "validate_participant_scope_organization"();

-- Convert Participant.scopeType from String to ParticipantScope enum
ALTER TABLE "Participant" ALTER COLUMN "scopeType" TYPE "ParticipantScope" USING "scopeType"::"ParticipantScope";

-- Recreate the validation function using the enum type
CREATE OR REPLACE FUNCTION "validate_participant_scope_organization"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."scopeType" = 'chat' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "Chat"
            WHERE "id" = NEW."scopeId"
              AND "organizationId" = NEW."organizationId"
        ) THEN
            RAISE EXCEPTION 'Participant chat scope does not belong to organization';
        END IF;
    ELSIF NEW."scopeType" = 'channel' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "Channel"
            WHERE "id" = NEW."scopeId"
              AND "organizationId" = NEW."organizationId"
        ) THEN
            RAISE EXCEPTION 'Participant channel scope does not belong to organization';
        END IF;
    ELSIF NEW."scopeType" = 'session' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "Session"
            WHERE "id" = NEW."scopeId"
              AND "organizationId" = NEW."organizationId"
        ) THEN
            RAISE EXCEPTION 'Participant session scope does not belong to organization';
        END IF;
    ELSIF NEW."scopeType" = 'ticket' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "Ticket"
            WHERE "id" = NEW."scopeId"
              AND "organizationId" = NEW."organizationId"
        ) THEN
            RAISE EXCEPTION 'Participant ticket scope does not belong to organization';
        END IF;
    ELSIF NEW."scopeType" = 'thread' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "Message"
            WHERE "id" = NEW."scopeId"
              AND "organizationId" = NEW."organizationId"
              AND "parentMessageId" IS NULL
        ) THEN
            RAISE EXCEPTION 'Participant thread scope does not belong to organization';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER "Participant_validate_scope_organization"
BEFORE INSERT OR UPDATE OF "scopeType", "scopeId", "organizationId"
ON "Participant"
FOR EACH ROW
EXECUTE FUNCTION "validate_participant_scope_organization"();

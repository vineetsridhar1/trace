-- CreateEnum
CREATE TYPE "ParticipantScope" AS ENUM ('channel', 'chat', 'session', 'ticket', 'thread', 'system');

-- Convert Participant.scopeType from String to ParticipantScope enum
ALTER TABLE "Participant" ALTER COLUMN "scopeType" TYPE "ParticipantScope" USING "scopeType"::"ParticipantScope";

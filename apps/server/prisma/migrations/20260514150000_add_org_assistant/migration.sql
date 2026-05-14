CREATE TYPE "SessionKind" AS ENUM ('coding', 'org_assistant');
CREATE TYPE "SuggestedActionStatus" AS ENUM ('pending', 'approved', 'dismissed');
CREATE TYPE "SuggestedActionType" AS ENUM ('send_session_message', 'create_session');
CREATE TYPE "SuggestedActionTargetType" AS ENUM ('session', 'organization');

ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'suggested_action_created';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'suggested_action_approved';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'suggested_action_dismissed';

ALTER TABLE "Session" ADD COLUMN "kind" "SessionKind" NOT NULL DEFAULT 'coding';

CREATE TABLE "SuggestedAction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assistantSessionId" TEXT NOT NULL,
  "status" "SuggestedActionStatus" NOT NULL DEFAULT 'pending',
  "actionType" "SuggestedActionType" NOT NULL,
  "targetType" "SuggestedActionTargetType" NOT NULL,
  "targetId" TEXT,
  "input" JSONB NOT NULL,
  "rationale" TEXT,
  "proposedByActorType" "ActorType" NOT NULL,
  "proposedByActorId" TEXT NOT NULL,
  "approvedByActorType" "ActorType",
  "approvedByActorId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "dismissedByActorType" "ActorType",
  "dismissedByActorId" TEXT,
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SuggestedAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantCapabilityToken" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assistantSessionId" TEXT NOT NULL,
  "agentActorId" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantCapabilityToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssistantCapabilityToken_tokenHash_key" ON "AssistantCapabilityToken"("tokenHash");
CREATE INDEX "Session_organizationId_kind_updatedAt_idx" ON "Session"("organizationId", "kind", "updatedAt");
CREATE INDEX "SuggestedAction_organizationId_status_createdAt_idx" ON "SuggestedAction"("organizationId", "status", "createdAt");
CREATE INDEX "SuggestedAction_assistantSessionId_createdAt_idx" ON "SuggestedAction"("assistantSessionId", "createdAt");
CREATE INDEX "AssistantCapabilityToken_organizationId_assistantSessionId_idx" ON "AssistantCapabilityToken"("organizationId", "assistantSessionId");
CREATE INDEX "AssistantCapabilityToken_expiresAt_idx" ON "AssistantCapabilityToken"("expiresAt");

ALTER TABLE "SuggestedAction" ADD CONSTRAINT "SuggestedAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuggestedAction" ADD CONSTRAINT "SuggestedAction_assistantSessionId_fkey" FOREIGN KEY ("assistantSessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantCapabilityToken" ADD CONSTRAINT "AssistantCapabilityToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantCapabilityToken" ADD CONSTRAINT "AssistantCapabilityToken_assistantSessionId_fkey" FOREIGN KEY ("assistantSessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

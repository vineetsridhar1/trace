-- CreateEnum
CREATE TYPE "AgentObservability" AS ENUM ('OFF', 'SUGGEST', 'PARTICIPATE');

-- AlterTable: Add agentObservability to AiConversation
ALTER TABLE "AiConversation" ADD COLUMN "agentObservability" "AgentObservability" NOT NULL DEFAULT 'OFF';

-- AlterEnum: Add new event types
ALTER TYPE "EventType" ADD VALUE 'ai_conversation_observability_changed';
ALTER TYPE "EventType" ADD VALUE 'ai_conversation_entity_linked';
ALTER TYPE "EventType" ADD VALUE 'ai_conversation_entity_unlinked';

-- CreateTable: AiConversationLinkedEntity
CREATE TABLE "AiConversationLinkedEntity" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConversationLinkedEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiConversationLinkedEntity_conversationId_idx" ON "AiConversationLinkedEntity"("conversationId");

-- CreateIndex
CREATE INDEX "AiConversationLinkedEntity_entityType_entityId_idx" ON "AiConversationLinkedEntity"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AiConversationLinkedEntity_conversationId_entityType_entityId_key" ON "AiConversationLinkedEntity"("conversationId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "AiConversationLinkedEntity" ADD CONSTRAINT "AiConversationLinkedEntity_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

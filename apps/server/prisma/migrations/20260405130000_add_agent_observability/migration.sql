-- CreateEnum
CREATE TYPE "AgentObservability" AS ENUM ('OFF', 'SUGGEST', 'PARTICIPATE');

-- AlterTable
ALTER TABLE "AiConversation" ADD COLUMN "agentObservability" "AgentObservability" NOT NULL DEFAULT 'OFF';

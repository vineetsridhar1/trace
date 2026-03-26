-- AlterEnum
ALTER TYPE "ScopeType" ADD VALUE 'ai_conversation';

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'ai_conversation_created';
ALTER TYPE "EventType" ADD VALUE 'ai_conversation_title_updated';
ALTER TYPE "EventType" ADD VALUE 'ai_conversation_visibility_changed';
ALTER TYPE "EventType" ADD VALUE 'ai_branch_created';
ALTER TYPE "EventType" ADD VALUE 'ai_branch_labeled';
ALTER TYPE "EventType" ADD VALUE 'ai_turn_created';

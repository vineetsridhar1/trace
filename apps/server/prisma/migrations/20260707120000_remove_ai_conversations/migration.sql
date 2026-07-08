-- DropForeignKey
ALTER TABLE "AiTurn" DROP CONSTRAINT "AiTurn_branchId_fkey";

-- DropForeignKey
ALTER TABLE "AiTurn" DROP CONSTRAINT "AiTurn_parentTurnId_fkey";

-- DropForeignKey
ALTER TABLE "AiBranch" DROP CONSTRAINT "AiBranch_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "AiBranch" DROP CONSTRAINT "AiBranch_parentBranchId_fkey";

-- DropForeignKey
ALTER TABLE "AiBranch" DROP CONSTRAINT "AiBranch_forkTurnId_fkey";

-- DropForeignKey
ALTER TABLE "AiBranch" DROP CONSTRAINT "AiBranch_createdById_fkey";

-- DropForeignKey
ALTER TABLE "AiConversation" DROP CONSTRAINT "AiConversation_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "AiConversation" DROP CONSTRAINT "AiConversation_createdById_fkey";

-- DropTable
DROP TABLE "AiTurn";

-- DropTable
DROP TABLE "AiBranch";

-- DropTable
DROP TABLE "AiConversation";

-- DropEnum
DROP TYPE "TurnRole";

-- DropEnum
DROP TYPE "AiConversationVisibility";

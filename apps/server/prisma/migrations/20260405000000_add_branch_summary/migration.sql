-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'ai_branch_summary_updated';

-- AlterTable
ALTER TABLE "AiTurn" ADD COLUMN "summarized" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AiBranchSummary" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summarizedTurnCount" INTEGER NOT NULL,
    "summarizedUpToTurnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiBranchSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiBranchSummary_branchId_idx" ON "AiBranchSummary"("branchId");

-- AddForeignKey
ALTER TABLE "AiBranchSummary" ADD CONSTRAINT "AiBranchSummary_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "AiBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBranchSummary" ADD CONSTRAINT "AiBranchSummary_summarizedUpToTurnId_fkey" FOREIGN KEY ("summarizedUpToTurnId") REFERENCES "AiTurn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

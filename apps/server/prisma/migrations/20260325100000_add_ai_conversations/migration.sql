-- CreateEnum
CREATE TYPE "AiConversationVisibility" AS ENUM ('PRIVATE', 'ORG');

-- CreateEnum
CREATE TYPE "TurnRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT,
    "visibility" "AiConversationVisibility" NOT NULL DEFAULT 'PRIVATE',
    "rootBranchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBranch" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "parentBranchId" TEXT,
    "forkTurnId" TEXT,
    "label" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTurn" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "role" "TurnRole" NOT NULL,
    "content" TEXT NOT NULL,
    "parentTurnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiConversation_organizationId_createdById_idx" ON "AiConversation"("organizationId", "createdById");

-- CreateIndex
CREATE INDEX "AiConversation_organizationId_updatedAt_idx" ON "AiConversation"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiBranch_conversationId_idx" ON "AiBranch"("conversationId");

-- CreateIndex
CREATE INDEX "AiBranch_parentBranchId_idx" ON "AiBranch"("parentBranchId");

-- CreateIndex
CREATE UNIQUE INDEX "AiTurn_parentTurnId_key" ON "AiTurn"("parentTurnId");

-- CreateIndex
CREATE INDEX "AiTurn_branchId_createdAt_idx" ON "AiTurn"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "AiTurn_parentTurnId_idx" ON "AiTurn"("parentTurnId");

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBranch" ADD CONSTRAINT "AiBranch_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBranch" ADD CONSTRAINT "AiBranch_parentBranchId_fkey" FOREIGN KEY ("parentBranchId") REFERENCES "AiBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBranch" ADD CONSTRAINT "AiBranch_forkTurnId_fkey" FOREIGN KEY ("forkTurnId") REFERENCES "AiTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBranch" ADD CONSTRAINT "AiBranch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTurn" ADD CONSTRAINT "AiTurn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "AiBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTurn" ADD CONSTRAINT "AiTurn_parentTurnId_fkey" FOREIGN KEY ("parentTurnId") REFERENCES "AiTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

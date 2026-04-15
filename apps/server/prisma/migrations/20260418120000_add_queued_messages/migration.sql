-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'queued_message_added';
ALTER TYPE "EventType" ADD VALUE 'queued_message_removed';
ALTER TYPE "EventType" ADD VALUE 'queued_messages_cleared';
ALTER TYPE "EventType" ADD VALUE 'queued_messages_drained';

-- CreateTable
CREATE TABLE "QueuedMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "interactionMode" TEXT,
    "position" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueuedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueuedMessage_sessionId_position_idx" ON "QueuedMessage"("sessionId", "position");

-- AddForeignKey
ALTER TABLE "QueuedMessage" ADD CONSTRAINT "QueuedMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueuedMessage" ADD CONSTRAINT "QueuedMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

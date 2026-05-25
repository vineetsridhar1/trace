-- CreateTable
CREATE TABLE "SlackProcessedEvent" (
    "id" TEXT NOT NULL,
    "slackTeamId" TEXT,
    "slackEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackProcessedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackProcessedEvent_slackEventId_key" ON "SlackProcessedEvent"("slackEventId");

-- CreateIndex
CREATE INDEX "SlackProcessedEvent_createdAt_idx" ON "SlackProcessedEvent"("createdAt");

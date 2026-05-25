-- AlterTable
ALTER TABLE "SlackAccount" ADD COLUMN "preferredTool" "CodingTool";
ALTER TABLE "SlackAccount" ADD COLUMN "preferredModel" TEXT;
ALTER TABLE "SlackAccount" ADD COLUMN "preferredReasoningEffort" TEXT;

-- CreateTable
CREATE TABLE "SlackChannelBinding" (
    "id" TEXT NOT NULL,
    "slackTeamId" TEXT NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "traceChannelId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "boundById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackChannelBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackChannelBinding_slackTeamId_slackChannelId_key" ON "SlackChannelBinding"("slackTeamId", "slackChannelId");

-- CreateIndex
CREATE INDEX "SlackChannelBinding_traceChannelId_idx" ON "SlackChannelBinding"("traceChannelId");

-- CreateIndex
CREATE INDEX "SlackChannelBinding_organizationId_idx" ON "SlackChannelBinding"("organizationId");

-- AddForeignKey
ALTER TABLE "SlackChannelBinding" ADD CONSTRAINT "SlackChannelBinding_traceChannelId_fkey" FOREIGN KEY ("traceChannelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackChannelBinding" ADD CONSTRAINT "SlackChannelBinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackChannelBinding" ADD CONSTRAINT "SlackChannelBinding_boundById_fkey" FOREIGN KEY ("boundById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

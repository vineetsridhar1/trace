CREATE TABLE "SlackSessionDraft" (
    "id" TEXT NOT NULL,
    "slackTeamId" TEXT NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "slackThreadTs" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "traceChannelId" TEXT,
    "prompt" TEXT NOT NULL,
    "fileRefs" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackSessionDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SlackSessionDraft_slackTeamId_slackChannelId_slackThreadTs_idx"
  ON "SlackSessionDraft"("slackTeamId", "slackChannelId", "slackThreadTs");

CREATE INDEX "SlackSessionDraft_expiresAt_idx"
  ON "SlackSessionDraft"("expiresAt");

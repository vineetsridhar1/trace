ALTER TABLE "SlackProcessedEvent"
ADD COLUMN "slackMessageKey" TEXT;

CREATE UNIQUE INDEX "SlackProcessedEvent_slackMessageKey_key"
ON "SlackProcessedEvent"("slackMessageKey");

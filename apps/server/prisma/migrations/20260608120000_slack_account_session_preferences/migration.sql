ALTER TABLE "SlackAccount" ADD COLUMN "preferredHosting" "HostingMode";
ALTER TABLE "SlackAccount" ADD COLUMN "preferredEnvironmentId" TEXT;
ALTER TABLE "SlackAccount" ADD COLUMN "preferredRuntimeInstanceId" TEXT;
ALTER TABLE "SlackAccount" ADD COLUMN "preferredTraceChannelId" TEXT;

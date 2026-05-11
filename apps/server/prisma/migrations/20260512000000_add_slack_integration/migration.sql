-- CreateTable
CREATE TABLE "SlackInstall" (
    "id" TEXT NOT NULL,
    "slackTeamId" TEXT NOT NULL,
    "slackTeamName" TEXT,
    "botUserId" TEXT NOT NULL,
    "encryptedBotToken" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "installedById" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackAccount" (
    "id" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "slackTeamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackThreadSession" (
    "id" TEXT NOT NULL,
    "slackTeamId" TEXT NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "slackThreadTs" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackThreadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackInstall_slackTeamId_key" ON "SlackInstall"("slackTeamId");

-- CreateIndex
CREATE INDEX "SlackInstall_organizationId_idx" ON "SlackInstall"("organizationId");

-- CreateIndex
CREATE INDEX "SlackAccount_userId_idx" ON "SlackAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SlackAccount_slackUserId_slackTeamId_key" ON "SlackAccount"("slackUserId", "slackTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "SlackThreadSession_sessionId_key" ON "SlackThreadSession"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SlackThreadSession_slackTeamId_slackChannelId_slackThreadTs_key" ON "SlackThreadSession"("slackTeamId", "slackChannelId", "slackThreadTs");

-- AddForeignKey
ALTER TABLE "SlackInstall" ADD CONSTRAINT "SlackInstall_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackInstall" ADD CONSTRAINT "SlackInstall_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackAccount" ADD CONSTRAINT "SlackAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackThreadSession" ADD CONSTRAINT "SlackThreadSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

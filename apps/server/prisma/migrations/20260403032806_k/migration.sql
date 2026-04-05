-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiBranch_conversationId_createdAt_idx" ON "AiBranch"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChannelMember_channelId_leftAt_idx" ON "ChannelMember"("channelId", "leftAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Event_organizationId_timestamp_idx" ON "Event"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_channelId_deletedAt_idx" ON "Message"("channelId", "deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Session_channelId_updatedAt_idx" ON "Session"("channelId", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Session_organizationId_agentStatus_idx" ON "Session"("organizationId", "agentStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Ticket_organizationId_status_priority_idx" ON "Ticket"("organizationId", "status", "priority");

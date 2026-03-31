-- CreateIndex
CREATE INDEX "AiBranch_conversationId_createdAt_idx" ON "AiBranch"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChannelMember_channelId_leftAt_idx" ON "ChannelMember"("channelId", "leftAt");

-- CreateIndex
CREATE INDEX "Event_organizationId_timestamp_idx" ON "Event"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "Message_channelId_deletedAt_idx" ON "Message"("channelId", "deletedAt");

-- CreateIndex
CREATE INDEX "Session_organizationId_agentStatus_idx" ON "Session"("organizationId", "agentStatus");

-- CreateIndex
CREATE INDEX "Session_channelId_updatedAt_idx" ON "Session"("channelId", "updatedAt");

-- CreateIndex
CREATE INDEX "Ticket_organizationId_status_priority_idx" ON "Ticket"("organizationId", "status", "priority");

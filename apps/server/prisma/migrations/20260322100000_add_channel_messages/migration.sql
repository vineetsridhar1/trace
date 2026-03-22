-- Make chatId optional on Message
ALTER TABLE "Message" ALTER COLUMN "chatId" DROP NOT NULL;

-- Add channelId to Message
ALTER TABLE "Message" ADD COLUMN "channelId" TEXT;

-- CreateIndex
CREATE INDEX "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ensure every message belongs to either a chat or a channel
ALTER TABLE "Message" ADD CONSTRAINT "message_scope_check" CHECK ("chatId" IS NOT NULL OR "channelId" IS NOT NULL);

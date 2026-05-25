CREATE TYPE "ChannelVisibility" AS ENUM ('public', 'private');

ALTER TABLE "Channel" ADD COLUMN "visibility" "ChannelVisibility" NOT NULL DEFAULT 'public',
ADD COLUMN "ownerId" TEXT;

ALTER TABLE "Channel" ADD CONSTRAINT "Channel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Channel_ownerId_idx" ON "Channel"("ownerId");

-- AlterEnum
ALTER TYPE "InboxItemStatus" ADD VALUE 'expired';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InboxItemType" ADD VALUE 'ticket_suggestion';
ALTER TYPE "InboxItemType" ADD VALUE 'link_suggestion';
ALTER TYPE "InboxItemType" ADD VALUE 'session_suggestion';
ALTER TYPE "InboxItemType" ADD VALUE 'field_change_suggestion';
ALTER TYPE "InboxItemType" ADD VALUE 'comment_suggestion';
ALTER TYPE "InboxItemType" ADD VALUE 'message_suggestion';

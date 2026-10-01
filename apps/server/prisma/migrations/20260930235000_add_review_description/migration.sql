ALTER TYPE "EventType" ADD VALUE 'review_updated';

ALTER TABLE "Review"
ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

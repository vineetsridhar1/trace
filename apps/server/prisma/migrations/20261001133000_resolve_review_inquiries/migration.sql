ALTER TYPE "EventType" ADD VALUE 'review_inquiry_resolved';

ALTER TABLE "ReviewInquiry"
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolvedById" TEXT;

ALTER TABLE "ReviewInquiry"
ADD CONSTRAINT "ReviewInquiry_resolvedById_fkey"
FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

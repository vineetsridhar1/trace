-- Tracks when the current delivery attempt began, so an in-flight submission can be
-- distinguished from one that was abandoned mid-flight.
ALTER TABLE "ReviewDelivery"
ADD COLUMN "startedAt" TIMESTAMP(3);

UPDATE "ReviewDelivery" SET "startedAt" = "createdAt" WHERE "status" = 'submitting';

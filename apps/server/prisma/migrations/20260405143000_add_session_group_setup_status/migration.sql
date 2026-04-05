ALTER TABLE "SessionGroup"
ADD COLUMN "setupStatus" TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN "setupError" TEXT;

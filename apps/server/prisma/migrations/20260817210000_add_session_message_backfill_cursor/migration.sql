CREATE TABLE "SessionMessageBackfillCursor" (
    "name" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionMessageBackfillCursor_pkey" PRIMARY KEY ("name")
);

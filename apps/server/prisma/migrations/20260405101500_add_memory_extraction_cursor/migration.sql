CREATE TABLE "MemoryExtractionCursor" (
    "organizationId" TEXT NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "lastEventId" TEXT NOT NULL,
    "lastEventTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryExtractionCursor_pkey" PRIMARY KEY ("organizationId", "scopeType", "scopeId"),
    CONSTRAINT "MemoryExtractionCursor_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "MemoryExtractionCursor_organizationId_lastEventTimestamp_idx"
ON "MemoryExtractionCursor"("organizationId", "lastEventTimestamp");

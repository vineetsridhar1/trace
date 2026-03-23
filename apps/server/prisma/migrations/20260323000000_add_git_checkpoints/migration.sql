CREATE TABLE "GitCheckpoint" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sessionGroupId" TEXT NOT NULL,
  "repoId" TEXT NOT NULL,
  "promptEventId" TEXT NOT NULL,
  "commitSha" TEXT NOT NULL,
  "parentShas" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "treeSha" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "committedAt" TIMESTAMP(3) NOT NULL,
  "filesChanged" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GitCheckpoint_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GitCheckpoint"
ADD CONSTRAINT "GitCheckpoint_sessionGroupId_fkey"
FOREIGN KEY ("sessionGroupId") REFERENCES "SessionGroup"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "GitCheckpoint"
ADD CONSTRAINT "GitCheckpoint_repoId_fkey"
FOREIGN KEY ("repoId") REFERENCES "Repo"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "GitCheckpoint"
ADD CONSTRAINT "GitCheckpoint_promptEventId_fkey"
FOREIGN KEY ("promptEventId") REFERENCES "Event"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE UNIQUE INDEX "GitCheckpoint_sessionGroupId_commitSha_key"
ON "GitCheckpoint"("sessionGroupId", "commitSha");

CREATE INDEX "GitCheckpoint_sessionId_committedAt_idx"
ON "GitCheckpoint"("sessionId", "committedAt");

CREATE INDEX "GitCheckpoint_sessionGroupId_committedAt_idx"
ON "GitCheckpoint"("sessionGroupId", "committedAt");

CREATE INDEX "GitCheckpoint_repoId_committedAt_idx"
ON "GitCheckpoint"("repoId", "committedAt");

CREATE INDEX "GitCheckpoint_promptEventId_idx"
ON "GitCheckpoint"("promptEventId");

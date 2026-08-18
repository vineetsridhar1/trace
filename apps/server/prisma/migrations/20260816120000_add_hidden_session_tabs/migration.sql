ALTER TYPE "EventType" ADD VALUE 'session_tab_hidden';
ALTER TYPE "EventType" ADD VALUE 'session_tab_restored';

CREATE TABLE "HiddenSessionTab" (
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HiddenSessionTab_pkey" PRIMARY KEY ("userId", "sessionId")
);

CREATE INDEX "HiddenSessionTab_userId_hiddenAt_idx" ON "HiddenSessionTab"("userId", "hiddenAt");
CREATE INDEX "HiddenSessionTab_sessionId_idx" ON "HiddenSessionTab"("sessionId");

ALTER TABLE "HiddenSessionTab" ADD CONSTRAINT "HiddenSessionTab_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiddenSessionTab" ADD CONSTRAINT "HiddenSessionTab_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

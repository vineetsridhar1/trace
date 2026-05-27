ALTER TABLE "SessionGroup" ADD COLUMN "forkedFromSessionGroupId" TEXT;

ALTER TABLE "SessionGroup"
  ADD CONSTRAINT "SessionGroup_forkedFromSessionGroupId_fkey"
  FOREIGN KEY ("forkedFromSessionGroupId")
  REFERENCES "SessionGroup"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "SessionGroup_forkedFromSessionGroupId_idx" ON "SessionGroup"("forkedFromSessionGroupId");

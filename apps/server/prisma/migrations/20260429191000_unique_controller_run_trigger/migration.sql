DROP INDEX IF EXISTS "UltraplanControllerRun_triggerEventId_idx";

CREATE UNIQUE INDEX "UltraplanControllerRun_triggerEventId_key"
  ON "UltraplanControllerRun"("triggerEventId");

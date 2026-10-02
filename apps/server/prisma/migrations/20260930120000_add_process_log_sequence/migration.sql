ALTER TABLE "SessionApplicationProcess"
ADD COLUMN "logSequence" INTEGER NOT NULL DEFAULT 0;

UPDATE "SessionApplicationProcess" AS process
SET "logSequence" = latest.sequence
FROM (
  SELECT "processId", MAX(sequence) AS sequence
  FROM "SessionApplicationLogEntry"
  GROUP BY "processId"
) AS latest
WHERE process.id = latest."processId";

-- Allocate sequences in the database so rolling deployments remain safe while
-- old replicas still calculate sequence numbers from the log table. Every
-- insert locks the owning process row and replaces the caller's proposed
-- sequence with the next authoritative value.
CREATE FUNCTION "allocateSessionApplicationLogSequence"()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "SessionApplicationProcess"
  SET "logSequence" = GREATEST("logSequence", NEW.sequence - 1) + 1
  WHERE id = NEW."processId"
  RETURNING "logSequence" INTO NEW.sequence;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SessionApplicationLogEntry_allocateSequence"
BEFORE INSERT ON "SessionApplicationLogEntry"
FOR EACH ROW
EXECUTE FUNCTION "allocateSessionApplicationLogSequence"();

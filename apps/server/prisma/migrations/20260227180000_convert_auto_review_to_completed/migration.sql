-- Convert any existing auto_review workspaces to completed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspaces') THEN
    UPDATE "workspaces" SET "status" = 'completed' WHERE "status" = 'auto_review';
  END IF;
END $$;

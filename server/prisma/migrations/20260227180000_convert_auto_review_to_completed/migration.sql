-- Convert any existing auto_review workspaces to completed
UPDATE "workspaces" SET "status" = 'completed' WHERE "status" = 'auto_review';

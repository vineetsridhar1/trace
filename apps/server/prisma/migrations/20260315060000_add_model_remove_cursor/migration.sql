-- AlterTable
ALTER TABLE "Session" ADD COLUMN "model" TEXT;

-- Remove cursor from CodingTool enum
-- First update any rows using cursor to claude_code
UPDATE "Session" SET "tool" = 'claude_code' WHERE "tool" = 'cursor';

-- Recreate enum without cursor
ALTER TYPE "CodingTool" RENAME TO "CodingTool_old";
CREATE TYPE "CodingTool" AS ENUM ('claude_code', 'codex', 'custom');
ALTER TABLE "Session" ALTER COLUMN "tool" TYPE "CodingTool" USING "tool"::text::"CodingTool";
DROP TYPE "CodingTool_old";

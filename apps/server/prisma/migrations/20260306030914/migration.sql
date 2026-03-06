-- AlterTable (conditional — column may already exist from an earlier deploy)
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "default_teardown_script" TEXT;

-- AlterTable
ALTER TABLE "events" ALTER COLUMN "agent_type" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "agent_type" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN  IF NOT EXISTS "github_username" TEXT;

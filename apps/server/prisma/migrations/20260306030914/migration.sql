-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "default_teardown_script" TEXT;

-- AlterTable
ALTER TABLE "events" ALTER COLUMN "agent_type" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "agent_type" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "github_username" TEXT;

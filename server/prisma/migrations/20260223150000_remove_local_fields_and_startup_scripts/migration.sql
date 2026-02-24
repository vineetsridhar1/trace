-- DropForeignKey
ALTER TABLE "startup_scripts" DROP CONSTRAINT IF EXISTS "startup_scripts_channel_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "startup_scripts";

-- AlterTable
ALTER TABLE "channels" DROP COLUMN IF EXISTS "local_repo_path";
ALTER TABLE "channels" DROP COLUMN IF EXISTS "creation_script";

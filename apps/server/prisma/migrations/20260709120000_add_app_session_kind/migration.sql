-- CreateEnum
CREATE TYPE "SessionGroupKind" AS ENUM ('coding', 'design', 'app');

-- AlterTable
ALTER TABLE "SessionGroup" ADD COLUMN "kind" "SessionGroupKind" NOT NULL DEFAULT 'coding';

-- AlterTable
ALTER TABLE "SessionApplicationProcess" ALTER COLUMN "repoId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SessionEndpoint" ALTER COLUMN "repoId" DROP NOT NULL;

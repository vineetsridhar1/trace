-- DropForeignKey
ALTER TABLE "OrgSecret" DROP CONSTRAINT IF EXISTS "OrgSecret_organizationId_fkey";

-- DropTable
DROP TABLE IF EXISTS "OrgSecret";
